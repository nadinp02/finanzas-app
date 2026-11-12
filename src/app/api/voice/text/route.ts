import { voiceTextSchema } from "@/modules/voice/schema";
import { processVoiceText } from "@/modules/voice/service";
import { authedRoute, json, parseJson } from "@/server/http";
import { RATE_LIMITS } from "@/server/rate-limit";

export const maxDuration = 60;

/** La frase escrita en lugar de dictada: mismo proceso sin transcripción. */
export const POST = authedRoute(
  async ({ request, user }) => {
    const input = await parseJson(request, voiceTextSchema);
    return json({ entry: await processVoiceText(user, input) });
  },
  { rateLimit: RATE_LIMITS.voice },
);
