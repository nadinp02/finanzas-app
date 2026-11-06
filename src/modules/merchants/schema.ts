import { idSchema, nameSchema, z } from "@/lib/validation";

const aliasesSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(10, { error: "Hasta 10 variantes." })
  .default([]);

export const createMerchantSchema = z.object({
  name: nameSchema(80),
  aliases: aliasesSchema,
  defaultCategoryId: idSchema.nullable().optional(),
});

export const updateMerchantSchema = z.object({
  name: nameSchema(80).optional(),
  aliases: aliasesSchema.optional(),
  defaultCategoryId: idSchema.nullable().optional(),
});

export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;
export type UpdateMerchantInput = z.infer<typeof updateMerchantSchema>;

export interface MerchantDTO {
  id: string;
  name: string;
  aliases: string[];
  defaultCategoryId: string | null;
  usageCount: number;
}
