import { updateCardSchema } from "@/modules/cards/schema";
import { updateCard } from "@/modules/cards/service";
import { authedRoute, noContent, parseJson } from "@/server/http";

export const PATCH = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  await updateCard(user.id, params.id, await parseJson(request, updateCardSchema));
  return noContent();
});
