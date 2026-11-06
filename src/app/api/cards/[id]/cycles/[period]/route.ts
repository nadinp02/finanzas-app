import { cycleOverrideSchema, periodParamSchema } from "@/modules/cards/schema";
import { deleteCycleOverride, setCycleOverride } from "@/modules/cards/service";
import { authedRoute, noContent, parseJson } from "@/server/http";

export const PUT = authedRoute<{ id: string; period: string }>(async ({ request, params, user }) => {
  const period = periodParamSchema.parse(params.period);
  await setCycleOverride(user.id, params.id, period, await parseJson(request, cycleOverrideSchema));
  return noContent();
});

export const DELETE = authedRoute<{ id: string; period: string }>(async ({ params, user }) => {
  await deleteCycleOverride(user.id, params.id, periodParamSchema.parse(params.period));
  return noContent();
});
