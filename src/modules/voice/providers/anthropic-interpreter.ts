import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { buildUserMessage, outputSchema, SYSTEM_PROMPT } from "./prompt";
import { VoiceProviderError, type InterpretationRequest, type InterpretationResult, type TransactionInterpreter } from "./types";

const PROVIDER = "anthropic";

export interface AnthropicInterpreterOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Para pruebas: un cliente con la misma forma. */
  client?: Pick<Anthropic, "beta">;
}

function mapError(error: unknown): VoiceProviderError {
  if (error instanceof VoiceProviderError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new VoiceProviderError(PROVIDER, "timeout", "Claude: tiempo de espera agotado.");
  if (error instanceof Anthropic.APIUserAbortError) return new VoiceProviderError(PROVIDER, "timeout", "Claude: solicitud cancelada.");
  if (error instanceof Anthropic.APIConnectionError) return new VoiceProviderError(PROVIDER, "network", "Claude: no se pudo conectar.");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new VoiceProviderError(PROVIDER, "auth", "Claude: la clave de API no es válida.", error.status);
  }
  if (error instanceof Anthropic.RateLimitError) return new VoiceProviderError(PROVIDER, "rate_limit", "Claude: límite de uso alcanzado.", 429);
  if (error instanceof Anthropic.BadRequestError) return new VoiceProviderError(PROVIDER, "bad_request", "Claude: solicitud rechazada.", 400);
  if (error instanceof Anthropic.APIError) return new VoiceProviderError(PROVIDER, "server", "Claude: error del servicio.", error.status);
  // Fallas al validar la salida estructurada.
  return new VoiceProviderError(PROVIDER, "invalid_response", "Claude: respuesta con formato inválido.");
}

/**
 * Interpretación con Claude y salida estructurada validada con Zod (`beta.messages.parse`).
 * `effort: low` porque es una extracción acotada y la latencia importa; `fallbacks: "default"`
 * para que un rechazo del clasificador de seguridad no deje la función caída.
 */
export class AnthropicInterpreter implements TransactionInterpreter {
  readonly id = PROVIDER;
  readonly local = false;
  private readonly client: Pick<Anthropic, "beta">;

  constructor(private readonly options: AnthropicInterpreterOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout: options.timeoutMs ?? 30_000 });
  }

  async interpret({ transcript, context, signal }: InterpretationRequest): Promise<InterpretationResult> {
    const paths = context.categories.map((category) => category.path);
    let response;
    try {
      response = await this.client.beta.messages.parse(
        {
          model: this.options.model,
          max_tokens: 4096,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: betaZodOutputFormat(outputSchema(paths)) },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserMessage(transcript, context) }],
        },
        { signal },
      );
    } catch (error) {
      throw mapError(error);
    }
    if (response.stop_reason === "refusal") {
      throw new VoiceProviderError(PROVIDER, "refusal", "Claude no interpretó esta transcripción.");
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new VoiceProviderError(PROVIDER, "invalid_response", "Claude: respuesta incompleta.");
    }
    return { items: response.parsed_output.items, model: response.model };
  }
}
