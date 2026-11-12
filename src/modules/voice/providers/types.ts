/**
 * Interfaces de los proveedores de voz. El caso de uso (`service.ts`) solo conoce estas interfaces:
 * cambiar de OpenAI a Anthropic (o a un proveedor falso en pruebas) no lo modifica.
 */
import type { VoiceContext } from "../rules";

export interface TranscriptionRequest {
  audio: Blob;
  /** Tipo base ("audio/webm", "audio/mp4"). */
  mimeType: string;
  durationMs: number;
  /** Comercios más usados: ayudan a reconocer nombres propios. */
  keywords: string[];
  signal?: AbortSignal;
}

export interface Transcription {
  text: string;
  /** Modelo que transcribió (se guarda en `voice_entries.stt_model`). */
  model: string;
}

/** Audio → texto. */
export interface Transcriber {
  readonly id: string;
  transcribe(request: TranscriptionRequest): Promise<Transcription>;
}

export interface InterpretationRequest {
  transcript: string;
  context: VoiceContext;
  signal?: AbortSignal;
}

export interface InterpretationResult {
  /**
   * Movimientos tal como los devolvió el proveedor. **No se confía en esta forma**: el servicio la
   * valida con `interpretationSchema` y después con las reglas determinísticas.
   */
  items: unknown;
  model: string;
}

/** Texto → movimientos estructurados. */
export interface TransactionInterpreter {
  readonly id: string;
  /** El intérprete local por reglas: sus resultados siempre requieren revisión. */
  readonly local: boolean;
  interpret(request: InterpretationRequest): Promise<InterpretationResult>;
}

export type ProviderFailure =
  | "not_configured"
  | "network"
  | "timeout"
  | "auth"
  | "rate_limit"
  | "refusal"
  | "invalid_response"
  | "bad_request"
  | "server";

/** Falla de un proveedor externo. El mensaje nunca incluye datos de la usuaria. */
export class VoiceProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly failure: ProviderFailure,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}

export interface VoiceProviders {
  /** Null si no hay transcripción configurada: solo se puede escribir. */
  transcriber: Transcriber | null;
  interpreter: TransactionInterpreter;
  /** Respaldo si el intérprete principal falla (siempre el local). */
  fallbackInterpreter: TransactionInterpreter;
}

/** Ante un error de `fetch`, distingue cancelación/tiempo agotado de falla de red. */
export function fetchFailure(provider: string, error: unknown): VoiceProviderError {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new VoiceProviderError(provider, "timeout", `${provider}: tiempo de espera agotado.`);
  }
  return new VoiceProviderError(provider, "network", `${provider}: no se pudo conectar.`);
}

export function statusFailure(status: number): ProviderFailure {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "bad_request";
}
