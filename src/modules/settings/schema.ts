import { idSchema, nameSchema, z } from "@/lib/validation";

export const updateSettingsSchema = z.object({
  name: nameSchema(80).optional(),
  defaultAccountId: idSchema.nullable().optional(),
  voiceAutoSave: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
