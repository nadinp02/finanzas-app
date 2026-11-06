/**
 * Efectos contables de los movimientos (docs/BUSINESS_RULES.md §2). Función única usada para
 * movimientos individuales y para sumas agregadas por SQL, así la regla vive en un solo lugar.
 */
import type { AccountType, TransactionType } from "@/generated/prisma/enums";
import type { FieldErrors } from "@/lib/errors";
import type { Cents } from "@/lib/money";
import { isAsset, isCard } from "@/modules/accounts/rules";

/** Rol de la cuenta: principal (`account_id`) o contraparte (`to_account_id`). */
export type AccountRole = "primary" | "counterpart";

/** Signo del efecto de un movimiento sobre el saldo de una cuenta según su rol. */
export function balanceSign(type: TransactionType, role: AccountRole): bigint {
  if (role === "counterpart") return type === "TRANSFER" || type === "CARD_PAYMENT" ? 1n : 0n;
  switch (type) {
    case "INCOME":
    case "ADJUSTMENT":
      return 1n;
    case "EXPENSE":
    case "TRANSFER":
    case "CARD_PAYMENT":
      return -1n;
  }
}

export interface LedgerMovement {
  type: TransactionType;
  amount: Cents;
  accountId: string;
  toAccountId: string | null;
}

export function effectsOf(movement: LedgerMovement): { accountId: string; delta: Cents }[] {
  const effects = [{ accountId: movement.accountId, delta: balanceSign(movement.type, "primary") * movement.amount }];
  if (movement.toAccountId) {
    effects.push({ accountId: movement.toAccountId, delta: balanceSign(movement.type, "counterpart") * movement.amount });
  }
  return effects;
}

export interface FlowAggregate {
  accountId: string;
  type: TransactionType;
  role: AccountRole;
  total: Cents;
}

/** Saldo = saldo inicial + Σ efectos. `openings` debe incluir todas las cuentas a informar. */
export function balancesFromAggregates(openings: Map<string, Cents>, aggregates: FlowAggregate[]): Map<string, Cents> {
  const balances = new Map(openings);
  for (const { accountId, type, role, total } of aggregates) {
    if (!balances.has(accountId)) continue;
    balances.set(accountId, balances.get(accountId)! + balanceSign(type, role) * total);
  }
  return balances;
}

/** Solo ingresos y gastos son flujo; transferencias, pagos de tarjeta y ajustes no. */
export function isFlow(type: TransactionType): type is "INCOME" | "EXPENSE" {
  return type === "INCOME" || type === "EXPENSE";
}

interface AccountRef {
  type: AccountType;
  isActive: boolean;
}

/**
 * Valida qué cuentas admite cada tipo de movimiento (BUSINESS_RULES §2 y §4). Devuelve errores por
 * campo o null. `requireActive` aplica en altas: editar un movimiento viejo de una cuenta ya
 * desactivada es válido.
 */
export function validateAccountsForType(
  type: TransactionType,
  account: AccountRef,
  toAccount: AccountRef | null,
  options: { requireActive: boolean; installments?: number },
): FieldErrors | null {
  const fields: FieldErrors = {};
  if (options.requireActive && !account.isActive) fields.accountId = "La cuenta está desactivada.";
  if (options.requireActive && toAccount && !toAccount.isActive) fields.toAccountId = "La cuenta está desactivada.";

  switch (type) {
    case "INCOME":
      if (!isAsset(account.type)) fields.accountId = "Un ingreso se acredita en una cuenta, no en una tarjeta.";
      break;
    case "EXPENSE":
      if (options.installments && !isCard(account.type)) {
        fields.installments = "Las cuotas solo aplican a compras con tarjeta de crédito.";
      }
      break;
    case "TRANSFER":
      if (!isAsset(account.type)) fields.accountId = "Para pagar una tarjeta usá «Pago de tarjeta».";
      if (toAccount && !isAsset(toAccount.type)) fields.toAccountId = "Para pagar una tarjeta usá «Pago de tarjeta».";
      break;
    case "CARD_PAYMENT":
      if (!isAsset(account.type)) fields.accountId = "El pago sale de una cuenta, no de otra tarjeta.";
      if (toAccount && !isCard(toAccount.type)) fields.toAccountId = "Elegí la tarjeta que estás pagando.";
      break;
    case "ADJUSTMENT":
      break;
  }
  return Object.keys(fields).length ? fields : null;
}
