import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { TransactionSource, TransactionStatus } from "@/generated/prisma/enums";
import { formatShortDate, fromDbDate, todayIn, toDbDate, type LocalDate } from "@/lib/dates";
import { errors, type FieldErrors } from "@/lib/errors";
import { centsOf, parseDecimal, toDecimal } from "@/lib/money";
import { audit } from "@/server/audit";
import { prisma, transaction, type Tx } from "@/server/db";
import { defaultPaymentMethod, isCard } from "@/modules/accounts/rules";
import { buildInstallmentSchedule, periodOf } from "@/modules/cards/rules";
import { loadCycleConfig } from "@/modules/cards/service";
import { recordMerchantUsage, resolveMerchant } from "@/modules/merchants/service";
import { validateAccountsForType } from "./rules";
import type {
  CreateTransactionInput,
  TransactionDTO,
  TransactionFilters,
  TransactionInput,
} from "./schema";

const include = {
  account: { select: { id: true, name: true, type: true } },
  toAccount: { select: { id: true, name: true, type: true } },
  category: { select: { id: true, name: true, icon: true, color: true, parent: { select: { name: true } } } },
  merchant: { select: { id: true, name: true } },
  installmentPlan: {
    select: { installmentCount: true, installments: { select: { amount: true }, orderBy: { number: "desc" }, take: 1 } },
  },
} satisfies Prisma.TransactionInclude;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof include }>;

export function toTransactionDTO(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    status: row.status,
    source: row.source,
    date: fromDbDate(row.date),
    amount: toDecimal(centsOf(row.amount)),
    description: row.description,
    notes: row.notes,
    account: row.account,
    toAccount: row.toAccount,
    category: row.category
      ? {
          id: row.category.id,
          name: row.category.name,
          icon: row.category.icon,
          color: row.category.color,
          parentName: row.category.parent?.name ?? null,
        }
      : null,
    merchant: row.merchant,
    paymentMethod: row.paymentMethod,
    isFixed: row.isFixed,
    installments: row.installmentPlan
      ? {
          count: row.installmentPlan.installmentCount,
          amountEach: toDecimal(centsOf(row.installmentPlan.installments[0]?.amount ?? "0")),
        }
      : null,
    voiceEntryId: row.voiceEntryId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface WriteContext {
  source: TransactionSource;
  status?: TransactionStatus;
  voiceEntryId?: string;
  today?: LocalDate;
}

interface PreparedTransaction {
  data: Omit<Prisma.TransactionUncheckedCreateInput, "userId" | "status" | "source">;
  merchantId: string | null;
  installments: { count: number; cardAccountId: string } | null;
}

/**
 * Valida un movimiento contra todas las reglas (BUSINESS_RULES §4) y completa los valores
 * derivados: medio de pago, fijo/variable, descripción y comercio.
 */
async function prepare(
  tx: Tx,
  userId: string,
  input: TransactionInput,
  options: { today: LocalDate; requireActive: boolean },
): Promise<PreparedTransaction> {
  const fields: FieldErrors = {};
  if (input.date > options.today) fields.date = "La fecha no puede ser futura.";

  const account = await tx.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) throw errors.validation({ accountId: "Elegí una cuenta válida." });

  let toAccount: typeof account | null = null;
  if (input.type === "TRANSFER" || input.type === "CARD_PAYMENT") {
    if (input.toAccountId === input.accountId) throw errors.validation({ toAccountId: "Elegí una cuenta distinta." });
    toAccount = await tx.account.findFirst({ where: { id: input.toAccountId, userId } });
    if (!toAccount) throw errors.validation({ toAccountId: "Elegí una cuenta válida." });
  }

  const installments = input.type === "EXPENSE" ? input.installments : undefined;
  Object.assign(
    fields,
    validateAccountsForType(input.type, account, toAccount, { requireActive: options.requireActive, installments }),
  );

  for (const involved of [account, toAccount]) {
    if (involved && input.date < fromDbDate(involved.openingDate)) {
      fields.date ??= `${involved.name} se registra desde el ${formatShortDate(fromDbDate(involved.openingDate))}: el saldo inicial ya incluye lo anterior.`;
    }
  }

  let category: { id: string; name: string; isFixedDefault: boolean } | null = null;
  if (input.type === "INCOME" || input.type === "EXPENSE") {
    const found = await tx.category.findFirst({ where: { id: input.categoryId, userId } });
    if (!found) fields.categoryId = "Elegí una categoría.";
    else if (found.kind !== input.type) {
      fields.categoryId = input.type === "INCOME" ? "Elegí una categoría de ingresos." : "Elegí una categoría de gastos.";
    } else category = found;
  }

  if (Object.keys(fields).length) throw errors.validation(fields);

  let merchantId: string | null = null;
  let merchantName: string | null = null;
  if ((input.type === "INCOME" || input.type === "EXPENSE") && input.merchantName) {
    const merchant = await resolveMerchant(tx, userId, input.merchantName);
    merchantId = merchant?.id ?? null;
    merchantName = merchant?.name ?? null;
  }

  const isFlow = input.type === "INCOME" || input.type === "EXPENSE";
  const paymentMethod = isCard(account.type)
    ? input.type === "ADJUSTMENT"
      ? null
      : "CREDIT_CARD"
    : (isFlow ? input.paymentMethod : undefined) ?? defaultPaymentMethod(input.type, account.type);

  let description = input.description;
  if (!description) {
    switch (input.type) {
      case "INCOME":
      case "EXPENSE":
        description = merchantName ?? category!.name;
        break;
      case "TRANSFER":
        description = `Transferencia a ${toAccount!.name}`;
        break;
      case "CARD_PAYMENT":
        description = `Pago de ${toAccount!.name}`;
        break;
      case "ADJUSTMENT":
        description = isCard(account.type) ? "Ajuste de deuda" : "Ajuste de saldo";
        break;
    }
  }

  return {
    data: {
      type: input.type,
      date: toDbDate(input.date),
      amount: input.amount,
      description,
      notes: input.notes ?? null,
      accountId: account.id,
      toAccountId: toAccount?.id ?? null,
      categoryId: category?.id ?? null,
      merchantId,
      paymentMethod,
      isFixed: isFlow ? (input.isFixed ?? category!.isFixedDefault) : false,
    },
    merchantId,
    installments: installments ? { count: installments, cardAccountId: account.id } : null,
  };
}

async function createPurchasePlan(
  tx: Tx,
  userId: string,
  transactionId: string,
  plan: { count: number; cardAccountId: string },
  amount: string,
  date: LocalDate,
  description: string,
) {
  const config = await loadCycleConfig(tx, plan.cardAccountId);
  const firstPeriod = periodOf(config, date);
  const schedule = buildInstallmentSchedule(parseDecimal(amount), plan.count, firstPeriod);
  await tx.installmentPlan.create({
    data: {
      userId,
      cardAccountId: plan.cardAccountId,
      transactionId,
      description,
      installmentCount: plan.count,
      firstPeriod,
      installments: { create: schedule.map((item) => ({ number: item.number, amount: toDecimal(item.amount) })) },
    },
  });
}

/**
 * Inserta un movimiento validado. Para usar dentro de otra transacción de base de datos (voz,
 * recurrentes, ajustes); el alta desde la API pasa por `createTransaction`.
 */
export async function insertTransaction(
  tx: Tx,
  userId: string,
  input: TransactionInput & { clientId?: string },
  context: WriteContext,
): Promise<string> {
  const status = context.status ?? "CONFIRMED";
  const prepared = await prepare(tx, userId, input, { today: context.today ?? todayIn(), requireActive: true });
  const created = await tx.transaction.create({
    data: {
      userId,
      clientId: input.clientId ?? null,
      status,
      source: context.source,
      voiceEntryId: context.voiceEntryId ?? null,
      ...prepared.data,
    },
    select: { id: true },
  });
  if (prepared.installments) {
    await createPurchasePlan(tx, userId, created.id, prepared.installments, input.amount, input.date, prepared.data.description);
  }
  if (prepared.merchantId && status === "CONFIRMED") {
    await recordMerchantUsage(tx, prepared.merchantId, prepared.data.categoryId ?? null);
  }
  await audit({ userId, action: "CREATE", entityType: "Transaction", entityId: created.id, metadata: { source: context.source } }, tx);
  return created.id;
}

async function findByClientId(userId: string, clientId: string) {
  return prisma.transaction.findUnique({ where: { userId_clientId: { userId, clientId } }, include });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Alta idempotente: si el `clientId` ya existe devuelve ese movimiento (`created: false`). */
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
  context: WriteContext,
): Promise<{ transaction: TransactionDTO; created: boolean }> {
  const existing = await findByClientId(userId, input.clientId);
  if (existing) return { transaction: toTransactionDTO(existing), created: false };
  try {
    const id = await transaction((tx) => insertTransaction(tx, userId, input, context));
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id }, include });
    return { transaction: toTransactionDTO(row), created: true };
  } catch (error) {
    // Dos reintentos simultáneos: el segundo choca con el único (user_id, client_id).
    if (isUniqueViolation(error)) {
      const raced = await findByClientId(userId, input.clientId);
      if (raced) return { transaction: toTransactionDTO(raced), created: false };
    }
    throw error;
  }
}

async function getRow(tx: Tx, userId: string, id: string) {
  const row = await tx.transaction.findFirst({ where: { id, userId }, include });
  if (!row) throw errors.notFound("No encontramos ese movimiento.");
  return row;
}

function versionConflict(current: TransactionRow) {
  return errors.conflict(
    "VERSION_CONFLICT",
    "Este movimiento cambió en otro dispositivo. Revisá la versión actual.",
    { current: toTransactionDTO(current) },
  );
}

export async function getTransaction(userId: string, id: string): Promise<TransactionDTO> {
  return toTransactionDTO(await getRow(prisma, userId, id));
}

/** Edición completa con control de versión. Rehace las cuotas si corresponde. */
export async function updateTransaction(
  userId: string,
  id: string,
  version: number,
  input: TransactionInput,
  today = todayIn(),
): Promise<TransactionDTO> {
  return transaction(async (tx) => {
    const current = await getRow(tx, userId, id);
    if (current.version !== version) throw versionConflict(current);
    const newToAccount = "toAccountId" in input ? input.toAccountId : null;
    const accountsChanged = current.accountId !== input.accountId || current.toAccountId !== newToAccount;
    const prepared = await prepare(tx, userId, input, { today, requireActive: accountsChanged });

    const { count } = await tx.transaction.updateMany({
      where: { id, version },
      data: { ...prepared.data, version: { increment: 1 } },
    });
    if (count === 0) throw versionConflict(await getRow(tx, userId, id));

    await tx.installmentPlan.deleteMany({ where: { transactionId: id } });
    if (prepared.installments) {
      await createPurchasePlan(tx, userId, id, prepared.installments, input.amount, input.date, prepared.data.description);
    }
    const learned = prepared.merchantId !== current.merchantId || prepared.data.categoryId !== current.categoryId;
    if (prepared.merchantId && learned && current.status === "CONFIRMED") {
      await recordMerchantUsage(tx, prepared.merchantId, prepared.data.categoryId ?? null);
    }
    await audit(
      {
        userId,
        action: "UPDATE",
        entityType: "Transaction",
        entityId: id,
        metadata: { before: { type: current.type, amount: current.amount.toFixed(2), date: fromDbDate(current.date) } },
      },
      tx,
    );
    return toTransactionDTO(await getRow(tx, userId, id));
  });
}

/** Confirma un movimiento pendiente (recurrente), opcionalmente con el importe real. */
export async function confirmTransaction(
  userId: string,
  id: string,
  version: number,
  amount: string | undefined,
  today = todayIn(),
): Promise<TransactionDTO> {
  return transaction(async (tx) => {
    const current = await getRow(tx, userId, id);
    if (current.version !== version) throw versionConflict(current);
    if (current.status !== "PENDING") throw errors.conflict("ALREADY_CONFIRMED", "Este movimiento ya estaba confirmado.");
    const finalAmount = amount ?? current.amount.toFixed(2);
    const date = fromDbDate(current.date);
    const base = { amount: finalAmount, date, accountId: current.accountId, description: current.description, notes: current.notes ?? undefined };
    const input: TransactionInput =
      current.type === "INCOME" || current.type === "EXPENSE"
        ? { ...base, type: current.type, categoryId: current.categoryId!, paymentMethod: current.paymentMethod ?? undefined, isFixed: current.isFixed }
        : current.type === "ADJUSTMENT"
          ? { ...base, type: "ADJUSTMENT" }
          : { ...base, type: current.type, toAccountId: current.toAccountId! };
    await prepare(tx, userId, input, { today, requireActive: false });
    await tx.transaction.update({
      where: { id },
      data: { status: "CONFIRMED", amount: finalAmount, version: { increment: 1 } },
    });
    if (current.merchantId) await recordMerchantUsage(tx, current.merchantId, current.categoryId);
    await audit({ userId, action: "CONFIRM", entityType: "Transaction", entityId: id }, tx);
    return toTransactionDTO(await getRow(tx, userId, id));
  });
}

export async function deleteTransaction(userId: string, id: string, version?: number): Promise<void> {
  await transaction(async (tx) => {
    const current = await getRow(tx, userId, id);
    if (version !== undefined && current.version !== version) throw versionConflict(current);
    // La ocurrencia recurrente queda marcada para no volver a generarse.
    await tx.recurringOccurrence.updateMany({ where: { transactionId: id }, data: { status: "SKIPPED" } });
    await tx.transaction.delete({ where: { id } });
    await audit(
      {
        userId,
        action: "DELETE",
        entityType: "Transaction",
        entityId: id,
        metadata: { type: current.type, amount: current.amount.toFixed(2), date: fromDbDate(current.date), description: current.description },
      },
      tx,
    );
  });
}

/** Lista paginada por cursor, del más reciente al más antiguo. */
export async function listTransactions(
  userId: string,
  filters: TransactionFilters,
): Promise<{ items: TransactionDTO[]; nextCursor: string | null }> {
  const where: Prisma.TransactionWhereInput = { userId };
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from && { gte: toDbDate(filters.from) }),
      ...(filters.to && { lte: toDbDate(filters.to) }),
    };
  }
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.merchantId) where.merchantId = filters.merchantId;
  if (filters.categoryId) {
    const children = await prisma.category.findMany({ where: { userId, parentId: filters.categoryId }, select: { id: true } });
    where.categoryId = { in: [filters.categoryId, ...children.map((child) => child.id)] };
  }
  const and: Prisma.TransactionWhereInput[] = [];
  if (filters.accountId) and.push({ OR: [{ accountId: filters.accountId }, { toAccountId: filters.accountId }] });
  if (filters.q) {
    and.push({
      OR: [
        { description: { contains: filters.q, mode: "insensitive" } },
        { notes: { contains: filters.q, mode: "insensitive" } },
        { merchant: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const rows = await prisma.transaction.findMany({
    where,
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
    ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > filters.limit;
  const items = rows.slice(0, filters.limit).map(toTransactionDTO);
  return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
}
