import { todayIn } from "@/lib/dates";
import { adjustBalanceSchema } from "@/modules/accounts/schema";
import { adjustBalance } from "@/modules/accounts/service";
import { authedRoute, json, parseJson } from "@/server/http";

export const POST = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  const { actualBalance } = await parseJson(request, adjustBalanceSchema);
  const result = await adjustBalance(user.id, params.id, actualBalance, todayIn(user.timezone));
  return json({ adjustment: result }, result ? 201 : 200);
});
