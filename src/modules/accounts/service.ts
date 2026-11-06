import "server-only";
import type { AccountType, TransactionType } from "@/generated/prisma/enums";
import { fromDbDate, todayIn, toDbDate, type LocalDate } from "@/lib/dates";
import { errors } from "@/lib/errors";
import { centsOf, parseDecimal, sumCents, toDecimal, type Cents } from "@/lib/money";
import { audit } from "@/server/audit";
import { prisma, transaction, type Tx } from "@/server/db";
import { openingDebt } from "@/modules/cards/rules";
import { balancesFromAggregates, type AccountRole, type FlowAggregate } from "@/modules/transactions/rules";
import type { AccountDTO, CreateAccountInput, UpdateAccountInput } from "./schema";

interface AggregateRow {
  accountId: string;
  type: TransactionType;
  role: AccountRole;
  total: string;
}

/** Sumas de movimientos confirmados hasta `asOf`, por cuenta, tipo y rol. */
async function flowAggregates(db: Tx, userId: string, asOf: LocalDate): Promise<FlowAggregate[]> {
  const rows = await db.$queryRaw<AggregateRow[]>`
    SELECT account_id AS "accountId", type::text AS type, 'primary' AS role, SUM(amount)::text AS total
      FROM transactions
     WHERE user_id = ${userId}::uuid AND status = 'CONFIRMED' AND date <= ${asOf}::date
     GROUP BY account_id, type
    UNION ALL
    SELECT to_account_id AS "accountId", type::text AS type, 'counterpart' AS role, SUM(amount)::text AS total
      FROM transactions
     WHERE user_id = ${userId}::uuid AND status = 'CONFIRMED' AND date <= ${asOf}::date AND to_account_id IS NOT NULL
     GROUP BY to_account_id, type`;
  return rows.map((row) => ({ ...row, total: centsOf(row.total) }));
}

/** Cuotas de compras anteriores al inicio, por tarjeta: forman parte de la deuda inicial. */
export async function preexistingInstallmentTotals(db: Tx, userId: string): Promise<Map<string, Cents>> {
  const rows = await db.$queryRaw<{ accountId: string; total: string }[]>`
    SELECT p.card_account_id AS "accountId", SUM(i.amount)::text AS total
      FROM installments i
      JOIN installment_plans p ON p.id = i.plan_id
     WHERE p.user_id = ${userId}::uuid AND p.transaction_id IS NULL
     GROUP BY p.card_account_id`;
  return new Map(rows.map((row) => [row.accountId, centsOf(row.total)]));
}

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  isActive: boolean;
  balance: Cents;
}

/**
 * Saldos al final del día `asOf` (BUSINESS_RULES §5). Las cuentas abiertas después de `asOf` no
 * existían todavía y se excluyen. En tarjetas el saldo es −deuda.
 */
export async function getBalances(userId: string, asOf: LocalDate, db: Tx = prisma): Promise<AccountBalance[]> {
  // En serie: `db` puede ser una transacción, que usa una sola conexión.
  const accounts = await db.account.findMany({
    where: { userId, openingDate: { lte: toDbDate(asOf) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      isActive: true,
      openingBalance: true,
      card: { select: { openingStatementBalance: true, openingUnbilledBalance: true } },
    },
  });
  const preexisting = await preexistingInstallmentTotals(db, userId);
  const aggregates = await flowAggregates(db, userId, asOf);

  const openings = new Map<string, Cents>();
  for (const account of accounts) {
    openings.set(
      account.id,
      account.card
        ? -openingDebt(
            centsOf(account.card.openingStatementBalance),
            centsOf(account.card.openingUnbilledBalance),
            [preexisting.get(account.id) ?? 0n],
          )
        : centsOf(account.openingBalance),
    );
  }
  const balances = balancesFromAggregates(openings, aggregates);
  return accounts.map(({ id, name, type, isActive }) => ({ id, name, type, isActive, balance: balances.get(id) ?? 0n }));
}

export interface NetWorth {
  available: Cents;
  cardDebt: Cents;
  netWorth: Cents;
}

export function netWorthOf(balances: AccountBalance[]): NetWorth {
  const available = sumCents(balances.filter((a) => a.type !== "CREDIT_CARD").map((a) => a.balance));
  const cardDebt = -sumCents(balances.filter((a) => a.type === "CREDIT_CARD").map((a) => a.balance));
  return { available, cardDebt, netWorth: available - cardDebt };
}

export async function listAccounts(userId: string, today: LocalDate): Promise<AccountDTO[]> {
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    getBalances(userId, today),
  ]);
  const balanceById = new Map(balances.map((b) => [b.id, b.balance]));
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    institution: account.institution,
    isActive: account.isActive,
    openingBalance: toDecimal(centsOf(account.openingBalance)),
    openingDate: fromDbDate(account.openingDate),
    balance: toDecimal(balanceById.get(account.id) ?? 0n),
  }));
}

export async function getOwnedAccount(userId: string, id: string, db: Tx = prisma) {
  const account = await db.account.findFirst({ where: { id, userId }, include: { card: true } });
  if (!account) throw errors.notFound("No encontramos esa cuenta.");
  return account;
}

async function assertUniqueName(db: Tx, userId: string, name: string, exceptId?: string) {
  const existing = await db.account.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
  });
  if (existing) throw errors.validation({ name: "Ya tenés una cuenta con ese nombre." });
}

async function assertTrackingStart(db: Tx, userId: string, openingDate: LocalDate) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { trackingStartDate: true } });
  if (user.trackingStartDate && openingDate < fromDbDate(user.trackingStartDate)) {
    throw errors.validation({ openingDate: "La fecha no puede ser anterior al inicio del registro." });
  }
}

/** Las cuentas y tarjetas nuevas van al final del orden de la usuaria. */
export async function nextSortOrder(tx: Tx, userId: string): Promise<number> {
  const { _max } = await tx.account.aggregate({ where: { userId }, _max: { sortOrder: true } });
  return _max.sortOrder === null ? 0 : _max.sortOrder + 1;
}

export async function createAccount(userId: string, input: CreateAccountInput, today = todayIn()): Promise<{ id: string }> {
  if (input.openingDate > today) throw errors.validation({ openingDate: "La fecha no puede ser futura." });
  return transaction(async (tx) => {
    await assertUniqueName(tx, userId, input.name);
    await assertTrackingStart(tx, userId, input.openingDate);
    const account = await tx.account.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        institution: input.institution ?? null,
        openingBalance: input.openingBalance,
        openingDate: toDbDate(input.openingDate),
        sortOrder: await nextSortOrder(tx, userId),
      },
      select: { id: true },
    });
    await audit({ userId, action: "CREATE", entityType: "Account", entityId: account.id }, tx);
    return account;
  });
}

/** El primer movimiento de una cuenta acota cuánto puede adelantarse su fecha de apertura. */
export async function firstMovementDate(db: Tx, accountId: string): Promise<LocalDate | null> {
  const first = await db.transaction.findFirst({
    where: { OR: [{ accountId }, { toAccountId: accountId }] },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return first ? fromDbDate(first.date) : null;
}

export async function updateAccount(userId: string, id: string, input: UpdateAccountInput): Promise<void> {
  await transaction(async (tx) => {
    const account = await getOwnedAccount(userId, id, tx);
    if (account.type === "CREDIT_CARD" && input.openingBalance !== undefined) {
      throw errors.validation({ openingBalance: "La deuda inicial de una tarjeta se edita desde la tarjeta." });
    }
    if (input.name && input.name !== account.name) await assertUniqueName(tx, userId, input.name, id);
    if (input.openingDate) {
      await assertTrackingStart(tx, userId, input.openingDate);
      const first = await firstMovementDate(tx, id);
      if (first && first < input.openingDate) {
        throw errors.validation({ openingDate: `Hay movimientos desde el ${first}: la apertura no puede ser posterior.` });
      }
    }
    await tx.account.update({
      where: { id },
      data: {
        name: input.name,
        institution: input.institution === undefined ? undefined : input.institution ?? null,
        isActive: input.isActive,
        openingBalance: input.openingBalance,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
      },
    });
    if (input.isActive === false) {
      await tx.user.updateMany({ where: { id: userId, defaultAccountId: id }, data: { defaultAccountId: null } });
    }
    await audit({ userId, action: "UPDATE", entityType: "Account", entityId: id, metadata: { fields: Object.keys(input) } }, tx);
  });
}

/** Solo se borra una cuenta sin historia; con movimientos se desactiva. */
export async function deleteAccount(userId: string, id: string): Promise<void> {
  await transaction(async (tx) => {
    await getOwnedAccount(userId, id, tx);
    const movements = await tx.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }] } });
    const rules = await tx.recurringRule.count({ where: { accountId: id } });
    const plans = await tx.installmentPlan.count({ where: { cardAccountId: id } });
    if (movements + rules + plans > 0) {
      throw errors.conflict(
        "ACCOUNT_IN_USE",
        "Esta cuenta tiene movimientos o reglas asociadas. Desactivala para conservar la historia.",
        { movements, rules },
      );
    }
    await tx.account.delete({ where: { id } });
    await audit({ userId, action: "DELETE", entityType: "Account", entityId: id }, tx);
  });
}

/**
 * "El saldo real hoy es X": registra un ajuste por la diferencia con el saldo calculado. En tarjetas
 * `actual` es la deuda real (positiva). Devuelve null si no hay diferencia.
 */
export async function adjustBalance(
  userId: string,
  id: string,
  actual: string,
  today = todayIn(),
): Promise<{ transactionId: string; difference: string } | null> {
  return transaction(async (tx) => {
    const account = await getOwnedAccount(userId, id, tx);
    const balances = await getBalances(userId, today, tx);
    const current = balances.find((b) => b.id === id)?.balance ?? 0n;
    const target = account.type === "CREDIT_CARD" ? -parseDecimal(actual) : parseDecimal(actual);
    const difference = target - current;
    if (difference === 0n) return null;
    const created = await tx.transaction.create({
      data: {
        userId,
        type: "ADJUSTMENT",
        status: "CONFIRMED",
        source: "MANUAL",
        date: toDbDate(today),
        amount: toDecimal(difference),
        description: account.type === "CREDIT_CARD" ? "Ajuste de deuda" : "Ajuste de saldo",
        accountId: id,
      },
      select: { id: true },
    });
    await audit({ userId, action: "CREATE", entityType: "Transaction", entityId: created.id, metadata: { kind: "adjustment" } }, tx);
    return { transactionId: created.id, difference: toDecimal(difference) };
  });
}
