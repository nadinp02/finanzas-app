import "server-only";
import { addMonths, fromDbDate, todayIn, toDbDate, type LocalDate, type YearMonth } from "@/lib/dates";
import { errors } from "@/lib/errors";
import { centsOf, sumCents, toDecimal } from "@/lib/money";
import { audit } from "@/server/audit";
import { prisma, transaction, type Tx } from "@/server/db";
import { getOwnedAccount, nextSortOrder } from "@/modules/accounts/service";
import { computeCardStatus, periodOf, type CardCycleConfig, type CycleOverride } from "./rules";
import type {
  CardStatusDTO,
  CreateCardInput,
  InstallmentPlanDTO,
  PreexistingPlanInput,
  StatementDTO,
  UpdateCardInput,
} from "./schema";

/** Configuración de ciclo de una tarjeta con sus fechas ajustadas. */
export async function loadCycleConfig(db: Tx, cardAccountId: string): Promise<CardCycleConfig> {
  const card = await db.creditCard.findUniqueOrThrow({
    where: { accountId: cardAccountId },
    select: { closingDay: true, dueDay: true },
  });
  const overrides = await db.cardCycleOverride.findMany({ where: { cardAccountId } });
  return {
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    overrides: new Map<YearMonth, CycleOverride>(
      overrides.map((o) => [o.period, { closingDate: fromDbDate(o.closingDate), dueDate: fromDbDate(o.dueDate) }]),
    ),
  };
}

async function assertPaymentAccount(db: Tx, userId: string, paymentAccountId: string | undefined | null) {
  if (!paymentAccountId) return;
  const account = await db.account.findFirst({ where: { id: paymentAccountId, userId } });
  if (!account || account.type === "CREDIT_CARD") {
    throw errors.validation({ paymentAccountId: "Elegí una cuenta (no una tarjeta) para pagar el resumen." });
  }
}

async function createPreexistingPlans(
  db: Tx,
  userId: string,
  cardAccountId: string,
  firstPeriod: YearMonth,
  plans: PreexistingPlanInput[],
) {
  for (const plan of plans) {
    await db.installmentPlan.create({
      data: {
        userId,
        cardAccountId,
        description: plan.description,
        installmentCount: plan.installmentCount,
        firstInstallmentNumber: plan.nextInstallmentNumber,
        firstPeriod,
        installments: {
          create: Array.from({ length: plan.installmentCount - plan.nextInstallmentNumber + 1 }, (_, index) => ({
            number: plan.nextInstallmentNumber + index,
            amount: plan.installmentAmount,
          })),
        },
      },
    });
  }
}

/** Alta de tarjeta con su deuda inicial. Reutilizable dentro de la configuración inicial. */
export async function createCardInTx(tx: Tx, userId: string, input: CreateCardInput): Promise<{ id: string }> {
  const duplicate = await tx.account.findFirst({ where: { userId, name: { equals: input.name, mode: "insensitive" } } });
  if (duplicate) throw errors.validation({ name: "Ya tenés una cuenta o tarjeta con ese nombre." });
  await assertPaymentAccount(tx, userId, input.paymentAccountId);

  const account = await tx.account.create({
    data: {
      userId,
      name: input.name,
      type: "CREDIT_CARD",
      institution: input.institution ?? null,
      openingBalance: "0",
      openingDate: toDbDate(input.openingDate),
      sortOrder: await nextSortOrder(tx, userId),
      card: {
        create: {
          creditLimit: input.creditLimit ?? null,
          closingDay: input.closingDay,
          dueDay: input.dueDay,
          paymentAccountId: input.paymentAccountId ?? null,
          openingStatementBalance: input.openingStatementBalance,
          openingUnbilledBalance: input.openingUnbilledBalance,
        },
      },
    },
    select: { id: true },
  });
  const firstPeriod = periodOf({ closingDay: input.closingDay, dueDay: input.dueDay }, input.openingDate);
  await createPreexistingPlans(tx, userId, account.id, firstPeriod, input.preexistingPlans);
  await audit({ userId, action: "CREATE", entityType: "CreditCard", entityId: account.id }, tx);
  return account;
}

export async function createCard(userId: string, input: CreateCardInput, today = todayIn()): Promise<{ id: string }> {
  if (input.openingDate > today) throw errors.validation({ openingDate: "La fecha no puede ser futura." });
  return transaction((tx) => createCardInTx(tx, userId, input));
}

/**
 * Recalcula el resumen de la primera cuota de cada compra en cuotas registrada. Se llama cuando
 * cambian los días de cierre o las fechas ajustadas de un resumen.
 */
export async function rebuildInstallmentPeriods(db: Tx, cardAccountId: string): Promise<void> {
  const config = await loadCycleConfig(db, cardAccountId);
  const plans = await db.installmentPlan.findMany({
    where: { cardAccountId, transactionId: { not: null } },
    select: { id: true, firstPeriod: true, transaction: { select: { date: true } } },
  });
  for (const plan of plans) {
    const period = periodOf(config, fromDbDate(plan.transaction!.date));
    if (period !== plan.firstPeriod) {
      await db.installmentPlan.update({ where: { id: plan.id }, data: { firstPeriod: period } });
    }
  }
}

export async function updateCard(userId: string, id: string, input: UpdateCardInput): Promise<void> {
  await transaction(async (tx) => {
    const account = await getOwnedAccount(userId, id, tx);
    if (account.type !== "CREDIT_CARD" || !account.card) throw errors.notFound("No encontramos esa tarjeta.");
    if (input.name && input.name.toLowerCase() !== account.name.toLowerCase()) {
      const duplicate = await tx.account.findFirst({
        where: { userId, id: { not: id }, name: { equals: input.name, mode: "insensitive" } },
      });
      if (duplicate) throw errors.validation({ name: "Ya tenés una cuenta o tarjeta con ese nombre." });
    }
    await assertPaymentAccount(tx, userId, input.paymentAccountId);
    await tx.account.update({
      where: { id },
      data: {
        name: input.name,
        institution: input.institution === undefined ? undefined : input.institution ?? null,
        isActive: input.isActive,
      },
    });
    await tx.creditCard.update({
      where: { accountId: id },
      data: {
        creditLimit: input.creditLimit === undefined ? undefined : input.creditLimit,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        paymentAccountId: input.paymentAccountId === undefined ? undefined : input.paymentAccountId,
        openingStatementBalance: input.openingStatementBalance,
        openingUnbilledBalance: input.openingUnbilledBalance,
      },
    });
    if (input.closingDay !== undefined && input.closingDay !== account.card.closingDay) {
      await rebuildInstallmentPeriods(tx, id);
    }
    await audit({ userId, action: "UPDATE", entityType: "CreditCard", entityId: id, metadata: { fields: Object.keys(input) } }, tx);
  });
}

export async function setCycleOverride(
  userId: string,
  cardId: string,
  period: YearMonth,
  dates: { closingDate: LocalDate; dueDate: LocalDate },
): Promise<void> {
  if (!dates.closingDate.startsWith(period)) {
    throw errors.validation({ closingDate: "El cierre debe caer dentro del mes del resumen." });
  }
  await transaction(async (tx) => {
    const account = await getOwnedAccount(userId, cardId, tx);
    if (account.type !== "CREDIT_CARD") throw errors.notFound("No encontramos esa tarjeta.");
    await tx.cardCycleOverride.upsert({
      where: { cardAccountId_period: { cardAccountId: cardId, period } },
      create: { cardAccountId: cardId, period, closingDate: toDbDate(dates.closingDate), dueDate: toDbDate(dates.dueDate) },
      update: { closingDate: toDbDate(dates.closingDate), dueDate: toDbDate(dates.dueDate) },
    });
    await rebuildInstallmentPeriods(tx, cardId);
  });
}

export async function deleteCycleOverride(userId: string, cardId: string, period: YearMonth): Promise<void> {
  await transaction(async (tx) => {
    await getOwnedAccount(userId, cardId, tx);
    await tx.cardCycleOverride.deleteMany({ where: { cardAccountId: cardId, period } });
    await rebuildInstallmentPeriods(tx, cardId);
  });
}

function statementDTO(statement: {
  period: string;
  closingDate: string;
  dueDate: string;
  charges: bigint;
  balance: bigint;
  paid: bigint;
  status: StatementDTO["status"];
}): StatementDTO {
  return {
    period: statement.period,
    closingDate: statement.closingDate,
    dueDate: statement.dueDate,
    charges: toDecimal(statement.charges),
    balance: toDecimal(statement.balance),
    paid: toDecimal(statement.paid),
    status: statement.status,
  };
}

/** Estado completo de una tarjeta a la fecha `today` (BUSINESS_RULES §6). */
export async function getCardStatus(userId: string, cardId: string, today = todayIn()): Promise<CardStatusDTO> {
  const account = await getOwnedAccount(userId, cardId);
  if (account.type !== "CREDIT_CARD" || !account.card) throw errors.notFound("No encontramos esa tarjeta.");
  const card = account.card;
  const todayDate = toDbDate(today);

  const [config, movements, plans] = await Promise.all([
    loadCycleConfig(prisma, cardId),
    prisma.transaction.findMany({
      where: {
        userId,
        status: "CONFIRMED",
        date: { lte: todayDate },
        OR: [{ accountId: cardId }, { toAccountId: cardId }],
      },
      select: { type: true, date: true, amount: true, accountId: true, installmentPlan: { select: { id: true } } },
    }),
    prisma.installmentPlan.findMany({
      where: { cardAccountId: cardId, OR: [{ transactionId: null }, { transaction: { status: "CONFIRMED" } }] },
      include: { installments: { orderBy: { number: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const charges: { date: LocalDate; amount: bigint }[] = [];
  const payments: { date: LocalDate; amount: bigint }[] = [];
  const adjustments: { date: LocalDate; amount: bigint }[] = [];
  for (const movement of movements) {
    const date = fromDbDate(movement.date);
    const amount = centsOf(movement.amount);
    if (movement.type === "EXPENSE" && movement.accountId === cardId && !movement.installmentPlan) charges.push({ date, amount });
    else if (movement.type === "CARD_PAYMENT") payments.push({ date, amount });
    else if (movement.type === "ADJUSTMENT") adjustments.push({ date, amount });
  }

  const installments = plans.flatMap((plan) =>
    plan.installments.map((installment) => ({
      period: addMonths(plan.firstPeriod, installment.number - plan.firstInstallmentNumber),
      amount: centsOf(installment.amount),
    })),
  );

  const status = computeCardStatus(
    {
      config,
      openingDate: fromDbDate(account.openingDate),
      openingStatementBalance: centsOf(card.openingStatementBalance),
      openingUnbilledBalance: centsOf(card.openingUnbilledBalance),
      charges,
      installments,
      payments,
      adjustments,
      creditLimit: card.creditLimit ? centsOf(card.creditLimit) : null,
    },
    today,
  );

  const openPeriod = status.currentPeriod.period;
  const planDTOs: InstallmentPlanDTO[] = plans
    .map((plan) => {
      const periodOfInstallment = (number: number) => addMonths(plan.firstPeriod, number - plan.firstInstallmentNumber);
      const pending = plan.installments.filter((i) => periodOfInstallment(i.number) > openPeriod);
      // Las cuotas previas al inicio del registro ya se facturaron.
      const billedCount = plan.firstInstallmentNumber - 1 + plan.installments.length - pending.length;
      return {
        id: plan.id,
        description: plan.description,
        installmentCount: plan.installmentCount,
        billedCount,
        remainingAmount: toDecimal(sumCents(pending.map((i) => centsOf(i.amount)))),
        installmentAmount: toDecimal(centsOf(plan.installments.at(-1)?.amount ?? "0")),
        nextPeriod: pending[0] ? periodOfInstallment(pending[0].number) : null,
        transactionId: plan.transactionId,
      };
    })
    .filter((plan) => plan.nextPeriod !== null);

  return {
    id: account.id,
    name: account.name,
    institution: account.institution,
    isActive: account.isActive,
    creditLimit: card.creditLimit ? toDecimal(centsOf(card.creditLimit)) : null,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    paymentAccountId: card.paymentAccountId,
    openingDate: fromDbDate(account.openingDate),
    openingStatementBalance: toDecimal(centsOf(card.openingStatementBalance)),
    openingUnbilledBalance: toDecimal(centsOf(card.openingUnbilledBalance)),
    totalDebt: toDecimal(status.totalDebt),
    availableLimit: status.availableLimit === null ? null : toDecimal(status.availableLimit),
    lastStatement: status.lastStatement
      ? {
          ...statementDTO(status.lastStatement),
          remaining: toDecimal(status.lastStatement.remaining),
          creditBalance: toDecimal(status.lastStatement.creditBalance),
        }
      : null,
    currentPeriod: { ...status.currentPeriod, charges: toDecimal(status.currentPeriod.charges) },
    futureInstallments: toDecimal(status.futureInstallments),
    futureInstallmentsByPeriod: status.futureInstallmentsByPeriod.map((item) => ({ period: item.period, amount: toDecimal(item.amount) })),
    statements: status.statements.map(statementDTO),
    plans: planDTOs,
  };
}

/** Estado de todas las tarjetas activas (lista de cuentas, dashboard, recordatorios). */
export async function listCardStatuses(userId: string, today = todayIn()): Promise<CardStatusDTO[]> {
  const cards = await prisma.account.findMany({
    where: { userId, type: "CREDIT_CARD" },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, openingDate: true },
  });
  const visible = cards.filter((card) => fromDbDate(card.openingDate) <= today);
  return Promise.all(visible.map((card) => getCardStatus(userId, card.id, today)));
}
