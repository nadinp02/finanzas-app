import type { PaymentMethod, TransactionSource, TransactionStatus, TransactionType } from "@/generated/prisma/enums";
import type { LocalDate } from "@/lib/dates";
import {
  idSchema,
  localDateSchema,
  nonZeroAmountSchema,
  optionalTextSchema,
  positiveAmountSchema,
  z,
} from "@/lib/validation";

export const TRANSACTION_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "CARD_PAYMENT", "ADJUSTMENT"] as const;
export const PAYMENT_METHODS = [
  "CASH",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "DIGITAL_WALLET",
  "DIRECT_DEBIT",
  "OTHER",
] as const satisfies readonly PaymentMethod[];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: "Gasto",
  INCOME: "Ingreso",
  TRANSFER: "Transferencia",
  CARD_PAYMENT: "Pago de tarjeta",
  ADJUSTMENT: "Ajuste de saldo",
};

export const MAX_INSTALLMENTS = 72;

const paymentMethodSchema = z.enum(PAYMENT_METHODS);
const description = optionalTextSchema(140);
const notes = optionalTextSchema(1000);
const merchantName = optionalTextSchema(80);

const flowFields = {
  amount: positiveAmountSchema,
  date: localDateSchema,
  accountId: idSchema,
  categoryId: idSchema,
  merchantName,
  paymentMethod: paymentMethodSchema.optional(),
  isFixed: z.boolean().optional(),
  description,
  notes,
};

const movementFields = {
  amount: positiveAmountSchema,
  date: localDateSchema,
  accountId: idSchema,
  toAccountId: idSchema,
  description,
  notes,
};

/** Campos editables de un movimiento, según su tipo. */
export const transactionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EXPENSE"),
    ...flowFields,
    installments: z
      .number()
      .int()
      .min(2, { error: "Las cuotas van de 2 a 72." })
      .max(MAX_INSTALLMENTS, { error: "Las cuotas van de 2 a 72." })
      .optional(),
  }),
  z.object({ type: z.literal("INCOME"), ...flowFields }),
  z.object({ type: z.literal("TRANSFER"), ...movementFields }),
  z.object({ type: z.literal("CARD_PAYMENT"), ...movementFields }),
  z.object({
    type: z.literal("ADJUSTMENT"),
    amount: nonZeroAmountSchema,
    date: localDateSchema,
    accountId: idSchema,
    description,
    notes,
  }),
]);

export type TransactionInput = z.infer<typeof transactionInputSchema>;

/** Alta: el cliente genera `clientId` (UUID) para que los reintentos sean idempotentes. */
export const createTransactionSchema = z.intersection(transactionInputSchema, z.object({ clientId: idSchema }));

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  version: z.number().int().positive(),
  data: transactionInputSchema,
});

export const confirmTransactionSchema = z.object({
  version: z.number().int().positive(),
  amount: positiveAmountSchema.optional(),
});

export const deleteTransactionSchema = z.object({
  version: z.coerce.number().int().positive().optional(),
});

export const transactionFiltersSchema = z.object({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  status: z.enum(["CONFIRMED", "PENDING"]).optional(),
  categoryId: idSchema.optional(),
  accountId: idSchema.optional(),
  merchantId: idSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

/** Valores iniciales para abrir el formulario de alta (desde voz, recurrentes, accesos directos). */
export interface TransactionDraft {
  type?: TransactionType;
  amount?: string;
  date?: LocalDate;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  merchantName?: string;
  description?: string;
}

/** Movimiento tal como lo devuelve la API. Importes como string decimal. */
export interface TransactionDTO {
  id: string;
  clientId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  source: TransactionSource;
  date: LocalDate;
  amount: string;
  description: string;
  notes: string | null;
  account: { id: string; name: string; type: string };
  toAccount: { id: string; name: string; type: string } | null;
  category: { id: string; name: string; icon: string; color: string; parentName: string | null } | null;
  merchant: { id: string; name: string } | null;
  paymentMethod: PaymentMethod | null;
  isFixed: boolean;
  installments: { count: number; amountEach: string } | null;
  voiceEntryId: string | null;
  version: number;
  createdAt: string;
}
