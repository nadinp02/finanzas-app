import { todayIn } from "@/lib/dates";
import { getCardStatus } from "@/modules/cards/service";
import { authedRoute, json } from "@/server/http";

export const GET = authedRoute<{ id: string }>(async ({ params, user }) =>
  json(await getCardStatus(user.id, params.id, todayIn(user.timezone))),
);
