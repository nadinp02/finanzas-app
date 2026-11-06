import {
  decimalSignedSchema,
  localDateSchema,
  nameSchema,
  nonNegativeAmountSchema,
  optionalTextSchema,
  positiveAmountSchema,
  z,
} from "@/lib/validation";
import { ASSET_ACCOUNT_TYPES } from "@/modules/accounts/rules";
import { preexistingPlanSchema } from "@/modules/cards/schema";

const refSchema = z.string().min(1).max(40);
const daySchema = z.number().int().min(1).max(31);

export const onboardingSchema = z
  .object({
    trackingStartDate: localDateSchema,
    accounts: z
      .array(
        z.object({
          ref: refSchema,
          name: nameSchema(60),
          type: z.enum(ASSET_ACCOUNT_TYPES),
          institution: optionalTextSchema(60),
          openingBalance: decimalSignedSchema,
        }),
      )
      .min(1, { error: "Agregá al menos una cuenta." })
      .max(20),
    cards: z
      .array(
        z.object({
          ref: refSchema,
          name: nameSchema(60),
          institution: optionalTextSchema(60),
          creditLimit: positiveAmountSchema.optional(),
          closingDay: daySchema,
          dueDay: daySchema,
          paymentAccountRef: refSchema.optional(),
          openingStatementBalance: nonNegativeAmountSchema.default("0"),
          openingUnbilledBalance: nonNegativeAmountSchema.default("0"),
          preexistingPlans: z.array(preexistingPlanSchema).max(30).default([]),
        }),
      )
      .max(10)
      .default([]),
    defaultAccountRef: refSchema.optional(),
    voiceAutoSave: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const names = [...value.accounts, ...value.cards].map((item) => item.name.toLowerCase());
    names.forEach((name, index) => {
      if (names.indexOf(name) !== index) {
        ctx.addIssue({ code: "custom", message: `El nombre «${name}» está repetido.`, path: ["accounts"] });
      }
    });
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;
