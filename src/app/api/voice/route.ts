import { errors } from "@/lib/errors";
import { isSupportedAudioType, VOICE_LIMITS, voiceAudioFieldsSchema } from "@/modules/voice/schema";
import { listPendingVoiceEntries, processVoiceAudio } from "@/modules/voice/service";
import { authedRoute, json } from "@/server/http";
import { RATE_LIMITS } from "@/server/rate-limit";

/** Transcripción + interpretación pueden tardar más que el límite por defecto de la plataforma. */
export const maxDuration = 60;

/** Margen para los campos del multipart además del audio. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** Cargas por voz que esperan revisión. */
export const GET = authedRoute(async ({ user }) => json({ items: await listPendingVoiceEntries(user.id) }));

/**
 * Audio dictado (multipart: `audio`, `clientRequestId`, `durationMs`). El archivo se lee en memoria,
 * se transcribe y se descarta: no se guarda.
 */
export const POST = authedRoute(
  async ({ request, user }) => {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > VOICE_LIMITS.maxAudioBytes + MULTIPART_OVERHEAD) {
      throw errors.payloadTooLarge("La grabación es demasiado pesada. Probá con una más corta.");
    }
    if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      throw errors.unsupportedMediaType("Enviá la grabación como multipart/form-data.");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw errors.badRequest("No se pudo leer la grabación.");
    }
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) throw errors.validation({ audio: "Falta la grabación." });
    if (audio.size > VOICE_LIMITS.maxAudioBytes) throw errors.payloadTooLarge("La grabación es demasiado pesada. Probá con una más corta.");
    if (!isSupportedAudioType(audio.type)) throw errors.unsupportedMediaType("El formato de la grabación no es compatible.");
    const fields = voiceAudioFieldsSchema.parse({
      clientRequestId: form.get("clientRequestId") ?? undefined,
      durationMs: form.get("durationMs") ?? undefined,
    });
    if (fields.durationMs < VOICE_LIMITS.minDurationMs) throw errors.validation({ audio: "La grabación es muy corta: mantené apretado y hablá." });
    const entry = await processVoiceAudio(user, { ...fields, audio, mimeType: audio.type });
    return json({ entry });
  },
  { rateLimit: RATE_LIMITS.voice },
);
