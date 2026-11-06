import { todayIn } from "@/lib/dates";
import { deleteTransactionSchema, updateTransactionSchema } from "@/modules/transactions/schema";
import { deleteTransaction, getTransaction, updateTransaction } from "@/modules/transactions/service";
import { authedRoute, json, noContent, parseJson, parseSearchParams } from "@/server/http";

export const GET = authedRoute<{ id: string }>(async ({ params, user }) => json(await getTransaction(user.id, params.id)));

export const PATCH = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  const { version, data } = await parseJson(request, updateTransactionSchema);
  return json(await updateTransaction(user.id, params.id, version, data, todayIn(user.timezone)));
});

export const DELETE = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  const { version } = parseSearchParams(request, deleteTransactionSchema);
  await deleteTransaction(user.id, params.id, version);
  return noContent();
});
