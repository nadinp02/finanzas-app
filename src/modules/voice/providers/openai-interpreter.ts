import "server-only";
import { buildUserMessage, outputJsonSchema, SYSTEM_PROMPT } from "./prompt";
import {
  fetchFailure,
  statusFailure,
  VoiceProviderError,
  type InterpretationRequest,
  type InterpretationResult,
  type TransactionInterpreter,
} from "./types";

const PROVIDER = "openai";
const ENDPOINT = "https://api.openai.com/v1/responses";

export interface OpenAIInterpreterOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ResponsesOutput {
  status?: string;
  model?: string;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
}

/**
 * Interpretación con OpenAI (Responses API, salida estructurada `json_schema` estricta). Usa el mismo
 * prompt y formato que Claude: se elige con `VOICE_INTERPRETER=openai`. Por `fetch`, sin el SDK
 * (ver ARCHITECTURE, decisión 11).
 */
export class OpenAIInterpreter implements TransactionInterpreter {
  readonly id = PROVIDER;
  readonly local = false;

  constructor(private readonly options: OpenAIInterpreterOptions) {}

  async interpret({ transcript, context, signal }: InterpretationRequest): Promise<InterpretationResult> {
    const doFetch = this.options.fetch ?? fetch;
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(transcript, context) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "movimientos",
              schema: outputJsonSchema(context.categories.map((category) => category.path)),
              strict: true,
            },
          },
          max_output_tokens: 4096,
          store: false,
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      throw fetchFailure(PROVIDER, error);
    }
    if (!response.ok) {
      throw new VoiceProviderError(PROVIDER, statusFailure(response.status), `OpenAI respondió ${response.status}.`, response.status);
    }
    const body = (await response.json().catch(() => null)) as ResponsesOutput | null;
    if (!body || body.status === "incomplete") {
      throw new VoiceProviderError(PROVIDER, "invalid_response", "OpenAI: respuesta incompleta.");
    }
    const parts = (body.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
    if (parts.some((part) => part.type === "refusal")) {
      throw new VoiceProviderError(PROVIDER, "refusal", "OpenAI no interpretó esta transcripción.");
    }
    const text = parts.find((part) => part.type === "output_text")?.text;
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || !("items" in parsed)) {
      throw new VoiceProviderError(PROVIDER, "invalid_response", "OpenAI: respuesta con formato inválido.");
    }
    return { items: (parsed as { items: unknown }).items, model: body.model ?? this.options.model };
  }
}
