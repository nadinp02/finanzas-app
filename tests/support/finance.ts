import { randomUUID } from "node:crypto";
import type { LocalDate } from "@/lib/dates";
import { centsOf, type Cents } from "@/lib/money";
import { prisma } from "@/server/db";
import { createAccount, getBalances } from "@/modules/accounts/service";
import { createCard } from "@/modules/cards/service";
import type { TransactionInput } from "@/modules/transactions/schema";
import { createTransaction } from "@/modules/transactions/service";
import { categoryId, createTestUser } from "./factories";

export const TODAY = "2026-11-04";

export const pesos = (value: number): Cents => BigInt(Math.round(value * 100));

/** Usuaria con efectivo ($ 50.000), banco ($ 500.000) y una Visa sin deuda desde el 1/10/2026. */
export async function setupFinance() {
  const user = await createTestUser({ trackingStartDate: "2026-10-01" });
  const cash = await createAccount(user.id, { name: "Efectivo", type: "CASH", openingBalance: "50000", openingDate: "2026-10-01" }, TODAY);
  const bank = await createAccount(user.id, { name: "Banco", type: "BANK", openingBalance: "500000", openingDate: "2026-10-01" }, TODAY);
  const card = await createCard(
    user.id,
    {
      name: "Visa",
      closingDay: 26,
      dueDay: 7,
      paymentAccountId: bank.id,
      openingDate: "2026-10-01",
      openingStatementBalance: "0",
      openingUnbilledBalance: "0",
      preexistingPlans: [],
    },
    TODAY,
  );
  const categories = {
    supermercado: await categoryId(user.id, "Supermercado"),
    farmacia: await categoryId(user.id, "Farmacia"),
    salud: await categoryId(user.id, "Salud"),
    sueldo: await categoryId(user.id, "Sueldo"),
    otros: await categoryId(user.id, "Otros"),
  };
  return { userId: user.id, cash: cash.id, bank: bank.id, card: card.id, categories };
}

export async function record(userId: string, input: TransactionInput, today: LocalDate = TODAY) {
  const { transaction } = await createTransaction(userId, { ...input, clientId: randomUUID() }, { source: "MANUAL", today });
  return transaction;
}

export async function balance(userId: string, accountId: string, asOf: LocalDate = TODAY): Promise<Cents> {
  const balances = await getBalances(userId, asOf);
  const found = balances.find((b) => b.id === accountId);
  if (!found) throw new Error(`La cuenta ${accountId} no existe a la fecha ${asOf}`);
  return found.balance;
}

/** Suma directa de gastos confirmados de un rango, para verificar que no hay duplicaciones. */
export async function expensesBetween(userId: string, from: LocalDate, to: LocalDate): Promise<Cents> {
  const { _sum } = await prisma.transaction.aggregate({
    where: {
      userId,
      type: "EXPENSE",
      status: "CONFIRMED",
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    _sum: { amount: true },
  });
  return _sum.amount ? centsOf(_sum.amount) : 0n;
}
