import { decimalSignedSchema, idSchema, localDateSchema, nameSchema, optionalTextSchema, z } from "@/lib/validation";
import { ASSET_ACCOUNT_TYPES } from "./rules";

export const createAccountSchema = z.object({
  name: nameSchema(60),
  type: z.enum(ASSET_ACCOUNT_TYPES),
  institution: optionalTextSchema(60),
  /** Puede ser negativo (cuenta en descubierto). */
  openingBalance: decimalSignedSchema,
  openingDate: localDateSchema,
});

export const updateAccountSchema = z.object({
  name: nameSchema(60).optional(),
  institution: optionalTextSchema(60).nullable(),
  isActive: z.boolean().optional(),
  openingBalance: decimalSignedSchema.optional(),
  openingDate: localDateSchema.optional(),
});

export const adjustBalanceSchema = z.object({
  actualBalance: decimalSignedSchema,
  accountId: idSchema.optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export interface AccountDTO {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  isActive: boolean;
  openingBalance: string;
  openingDate: string;
  /** Saldo a hoy. En tarjetas es negativo: −deuda. */
  balance: string;
}
