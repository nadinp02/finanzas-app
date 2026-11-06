import { todayIn } from "@/lib/dates";
import { createTransactionSchema, transactionFiltersSchema } from "@/modules/transactions/schema";
import { createTransaction, listTransactions } from "@/modules/transactions/service";
import { authedRoute, json, parseJson, parseSearchParams } from "@/server/http";

export const GET = authedRoute(async ({ request, user }) =>
  json(await listTransactions(user.id, parseSearchParams(request, transactionFiltersSchema))),
);

/** Alta idempotente: 201 si se creó, 200 si el clientId ya existía (reintento offline). */
export const POST = authedRoute(async ({ request, user }) => {
  const input = await parseJson(request, createTransactionSchema);
  const result = await createTransaction(user.id, input, { source: "MANUAL", today: todayIn(user.timezone) });
  return json(result.transaction, result.created ? 201 : 200);
});
