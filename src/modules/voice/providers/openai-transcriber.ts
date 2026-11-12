import "server-only";
import { baseMimeType } from "../schema";
import { fetchFailure, statusFailure, VoiceProviderError, type Transcriber, type Transcription, type TranscriptionRequest } from "./types";

const PROVIDER = "openai";
const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

/** Contexto para el reconocimiento (en el idioma del audio, como pide la documentación). */
const PROMPT = "Gastos e ingresos personales dictados en español de Argentina: importes en pesos, comercios, cuentas y medios de pago.";
const MAX_KEYWORDS = 50;

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

export interface OpenAITranscriberOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Palabras clave válidas: una línea, sin `<` ni `>` (requisito de la API). */
export function sanitizeKeywords(keywords: string[]): string[] {
  const clean = keywords.map((keyword) => keyword.replace(/[<>\r\n]+/g, " ").trim()).filter((keyword) => keyword.length > 0 && keyword.length <= 60);
  return [...new Set(clean)].slice(0, MAX_KEYWORDS);
}

/**
 * Transcripción con `gpt-transcribe` (POST /v1/audio/transcriptions, multipart). El audio viaja en
 * memoria y no se guarda en ningún lado.
 */
export class OpenAITranscriber implements Transcriber {
  readonly id = PROVIDER;

  constructor(private readonly options: OpenAITranscriberOptions) {}

  async transcribe({ audio, mimeType, keywords, signal }: TranscriptionRequest): Promise<Transcription> {
    const type = baseMimeType(mimeType);
    const form = new FormData();
    form.append("file", new File([audio], `dictado.${EXTENSIONS[type] ?? "webm"}`, { type }));
    form.append("model", this.options.model);
    form.append("languages[]", "es");
    for (const keyword of sanitizeKeywords(keywords)) form.append("keywords[]", keyword);
    form.append("prompt", PROMPT);
    form.append("response_format", "json");

    const doFetch = this.options.fetch ?? fetch;
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      throw fetchFailure(PROVIDER, error);
    }
    if (!response.ok) {
      throw new VoiceProviderError(PROVIDER, statusFailure(response.status), `OpenAI respondió ${response.status}.`, response.status);
    }
    const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
    if (!body || typeof body.text !== "string") {
      throw new VoiceProviderError(PROVIDER, "invalid_response", "OpenAI: respuesta sin transcripción.");
    }
    return { text: body.text, model: this.options.model };
  }
}
