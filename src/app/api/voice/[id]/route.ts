import { idSchema } from "@/lib/validation";
import { getVoiceEntry } from "@/modules/voice/service";
import { authedRoute, json } from "@/server/http";

export const GET = authedRoute<{ id: string }>(async ({ params, user }) => {
  return json({ entry: await getVoiceEntry(user.id, idSchema.parse(params.id)) });
});
