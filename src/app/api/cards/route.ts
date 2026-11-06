import { todayIn } from "@/lib/dates";
import { createCardSchema } from "@/modules/cards/schema";
import { createCard } from "@/modules/cards/service";
import { authedRoute, json, parseJson } from "@/server/http";

export const POST = authedRoute(async ({ request, user }) => {
  const input = await parseJson(request, createCardSchema);
  return json(await createCard(user.id, input, todayIn(user.timezone)), 201);
});
