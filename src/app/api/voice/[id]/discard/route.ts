import { idSchema } from "@/lib/validation";
import { discardVoiceEntry } from "@/modules/voice/service";
import { authedRoute, json } from "@/server/http";

/** Descarta una carga sin guardar nada. */
export const POST = authedRoute<{ id: string }>(async ({ params, user }) => {
  return json({ entry: await discardVoiceEntry(user.id, idSchema.parse(params.id)) });
});
