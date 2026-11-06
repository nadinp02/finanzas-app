import { updateMerchantSchema } from "@/modules/merchants/schema";
import { deleteMerchant, updateMerchant } from "@/modules/merchants/service";
import { authedRoute, noContent, parseJson } from "@/server/http";

export const PATCH = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  await updateMerchant(user.id, params.id, await parseJson(request, updateMerchantSchema));
  return noContent();
});

export const DELETE = authedRoute<{ id: string }>(async ({ params, user }) => {
  await deleteMerchant(user.id, params.id);
  return noContent();
});
