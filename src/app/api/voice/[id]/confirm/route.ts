import { todayIn } from "@/lib/dates";
import { idSchema } from "@/lib/validation";
import { confirmVoiceSchema } from "@/modules/voice/schema";
import { confirmVoiceEntry } from "@/modules/voice/service";
import { authedRoute, json, parseJson } from "@/server/http";

/** Guarda los borradores revisados. Idempotente: reintentar no duplica. */
export const POST = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  const input = await parseJson(request, confirmVoiceSchema);
  return json({ entry: await confirmVoiceEntry(user.id, idSchema.parse(params.id), input, todayIn(user.timezone)) });
});
