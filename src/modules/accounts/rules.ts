import type { AccountType, PaymentMethod, TransactionType } from "@/generated/prisma/enums";

export const ASSET_ACCOUNT_TYPES = ["CASH", "DIGITAL_WALLET", "BANK", "SAVINGS", "OTHER"] as const satisfies readonly AccountType[];

export type AssetAccountType = (typeof ASSET_ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Efectivo",
  DIGITAL_WALLET: "Billetera virtual",
  BANK: "Cuenta bancaria",
  SAVINGS: "Caja de ahorro",
  CREDIT_CARD: "Tarjeta de crédito",
  OTHER: "Otra cuenta",
};

export function isCard(type: AccountType): boolean {
  return type === "CREDIT_CARD";
}

export function isAsset(type: AccountType): boolean {
  return type !== "CREDIT_CARD";
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Tarjeta de crédito",
  BANK_TRANSFER: "Transferencia",
  DIGITAL_WALLET: "Billetera / QR",
  DIRECT_DEBIT: "Débito automático",
  OTHER: "Otro",
};

/** Medio de pago que se deduce de la cuenta cuando la usuaria no lo indica. */
export function defaultPaymentMethod(transactionType: TransactionType, accountType: AccountType): PaymentMethod | null {
  if (transactionType === "ADJUSTMENT") return null;
  if (transactionType === "TRANSFER" || transactionType === "CARD_PAYMENT") return "BANK_TRANSFER";
  switch (accountType) {
    case "CASH":
      return "CASH";
    case "DIGITAL_WALLET":
      return "DIGITAL_WALLET";
    case "CREDIT_CARD":
      return "CREDIT_CARD";
    case "BANK":
    case "SAVINGS":
      return transactionType === "EXPENSE" ? "DEBIT_CARD" : "BANK_TRANSFER";
    default:
      return "OTHER";
  }
}
