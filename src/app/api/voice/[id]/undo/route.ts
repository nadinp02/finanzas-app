import { idSchema } from "@/lib/validation";
import { undoVoiceEntry } from "@/modules/voice/service";
import { authedRoute, json } from "@/server/http";

/** Borra los movimientos que creó la carga (si no se editaron). */
export const POST = authedRoute<{ id: string }>(async ({ params, user }) => {
  return json({ entry: await undoVoiceEntry(user.id, idSchema.parse(params.id)) });
});
