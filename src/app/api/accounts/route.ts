import { todayIn } from "@/lib/dates";
import { createAccountSchema } from "@/modules/accounts/schema";
import { createAccount, listAccounts } from "@/modules/accounts/service";
import { authedRoute, json, parseJson } from "@/server/http";

export const GET = authedRoute(async ({ user }) => json(await listAccounts(user.id, todayIn(user.timezone))));

export const POST = authedRoute(async ({ request, user }) => {
  const input = await parseJson(request, createAccountSchema);
  return json(await createAccount(user.id, input, todayIn(user.timezone)), 201);
});
