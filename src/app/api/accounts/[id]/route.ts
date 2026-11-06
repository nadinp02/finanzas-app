import { updateAccountSchema } from "@/modules/accounts/schema";
import { deleteAccount, updateAccount } from "@/modules/accounts/service";
import { authedRoute, noContent, parseJson } from "@/server/http";

export const PATCH = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  await updateAccount(user.id, params.id, await parseJson(request, updateAccountSchema));
  return noContent();
});

export const DELETE = authedRoute<{ id: string }>(async ({ params, user }) => {
  await deleteAccount(user.id, params.id);
  return noContent();
});
