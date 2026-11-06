import { todayIn } from "@/lib/dates";
import { confirmTransactionSchema } from "@/modules/transactions/schema";
import { confirmTransaction } from "@/modules/transactions/service";
import { authedRoute, json, parseJson } from "@/server/http";

export const POST = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  const { version, amount } = await parseJson(request, confirmTransactionSchema);
  return json(await confirmTransaction(user.id, params.id, version, amount, todayIn(user.timezone)));
});
