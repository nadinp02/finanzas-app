import {
  idSchema,
  localDateSchema,
  nameSchema,
  nonNegativeAmountSchema,
  optionalTextSchema,
  positiveAmountSchema,
  yearMonthSchema,
  z,
} from "@/lib/validation";

const daySchema = z.number().int().min(1, { error: "Elegí un día del 1 al 31." }).max(31, { error: "Elegí un día del 1 al 31." });

export const preexistingPlanSchema = z
  .object({
    description: nameSchema(100, "una descripción"),
    installmentAmount: positiveAmountSchema,
    /** Número de la próxima cuota a facturar (p. ej. 4 si ya se pagaron 3). */
    nextInstallmentNumber: z.number().int().min(1),
    installmentCount: z.number().int().min(1).max(72),
  })
  .refine((plan) => plan.nextInstallmentNumber <= plan.installmentCount, {
    error: "La próxima cuota no puede superar el total de cuotas.",
    path: ["nextInstallmentNumber"],
  });

export const createCardSchema = z.object({
  name: nameSchema(60),
  institution: optionalTextSchema(60),
  creditLimit: positiveAmountSchema.optional(),
  closingDay: daySchema,
  dueDay: daySchema,
  paymentAccountId: idSchema.optional(),
  openingDate: localDateSchema,
  openingStatementBalance: nonNegativeAmountSchema.default("0"),
  openingUnbilledBalance: nonNegativeAmountSchema.default("0"),
  preexistingPlans: z.array(preexistingPlanSchema).max(30).default([]),
});

export const updateCardSchema = z.object({
  name: nameSchema(60).optional(),
  institution: optionalTextSchema(60).nullable(),
  creditLimit: positiveAmountSchema.nullable().optional(),
  closingDay: daySchema.optional(),
  dueDay: daySchema.optional(),
  paymentAccountId: idSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  openingStatementBalance: nonNegativeAmountSchema.optional(),
  openingUnbilledBalance: nonNegativeAmountSchema.optional(),
});

export const cycleOverrideSchema = z
  .object({
    closingDate: localDateSchema,
    dueDate: localDateSchema,
  })
  .refine((value) => value.dueDate > value.closingDate, {
    error: "El vencimiento debe ser posterior al cierre.",
    path: ["dueDate"],
  });

export const periodParamSchema = yearMonthSchema;

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type PreexistingPlanInput = z.infer<typeof preexistingPlanSchema>;

export interface StatementDTO {
  period: string;
  closingDate: string;
  dueDate: string;
  charges: string;
  balance: string;
  paid: string;
  status: "paid" | "partial" | "unpaid" | "overdue" | "no-balance";
}

export interface InstallmentPlanDTO {
  id: string;
  description: string;
  installmentCount: number;
  /** Cuotas ya facturadas en resúmenes cerrados o en curso. */
  billedCount: number;
  remainingAmount: string;
  installmentAmount: string;
  nextPeriod: string | null;
  transactionId: string | null;
}

export interface CardStatusDTO {
  id: string;
  name: string;
  institution: string | null;
  isActive: boolean;
  creditLimit: string | null;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string | null;
  openingDate: string;
  openingStatementBalance: string;
  openingUnbilledBalance: string;
  totalDebt: string;
  availableLimit: string | null;
  lastStatement: (StatementDTO & { remaining: string; creditBalance: string }) | null;
  currentPeriod: { period: string; closingDate: string; dueDate: string; charges: string };
  futureInstallments: string;
  futureInstallmentsByPeriod: { period: string; amount: string }[];
  statements: StatementDTO[];
  plans: InstallmentPlanDTO[];
}
