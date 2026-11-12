import "server-only";
import { env, type Env } from "@/server/env";
import { AnthropicInterpreter } from "./anthropic-interpreter";
import { FakeTranscriber, LocalInterpreter } from "./local";
import { OpenAIInterpreter } from "./openai-interpreter";
import { OpenAITranscriber } from "./openai-transcriber";
import type { VoiceTranscriptionMode } from "../schema";
import type { TransactionInterpreter, VoiceProviders } from "./types";

export type ProviderConfig = Pick<
  Env,
  | "OPENAI_API_KEY"
  | "OPENAI_TRANSCRIBE_MODEL"
  | "OPENAI_INTERPRETER_MODEL"
  | "ANTHROPIC_API_KEY"
  | "ANTHROPIC_MODEL"
  | "VOICE_INTERPRETER"
  | "VOICE_STT_PROVIDER"
  | "VOICE_FAKE_TRANSCRIPT"
>;

export interface ProviderSelection {
  providers: VoiceProviders;
  /** Configuración pedida que no se pudo cumplir (falta una clave): se informa en el log. */
  warnings: string[];
}

/**
 * Elige los proveedores según la configuración. Es el único lugar que conoce las implementaciones
 * concretas: el servicio recibe interfaces.
 */
export function selectVoiceProviders(config: ProviderConfig): ProviderSelection {
  const warnings: string[] = [];
  const local = new LocalInterpreter();

  const transcriber =
    config.VOICE_STT_PROVIDER === "fake"
      ? new FakeTranscriber(config.VOICE_FAKE_TRANSCRIPT ?? "")
      : config.OPENAI_API_KEY
        ? new OpenAITranscriber({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_TRANSCRIBE_MODEL })
        : null;

  let interpreter: TransactionInterpreter = local;
  const wanted = config.VOICE_INTERPRETER;
  if (wanted === "openai") {
    if (config.OPENAI_API_KEY) interpreter = new OpenAIInterpreter({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_INTERPRETER_MODEL });
    else warnings.push("VOICE_INTERPRETER=openai sin OPENAI_API_KEY: se usa el intérprete local.");
  } else if (wanted === "anthropic" || wanted === "auto") {
    if (config.ANTHROPIC_API_KEY) interpreter = new AnthropicInterpreter({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL });
    else if (wanted === "anthropic") warnings.push("VOICE_INTERPRETER=anthropic sin ANTHROPIC_API_KEY: se usa el intérprete local.");
  }

  return { providers: { transcriber, interpreter, fallbackInterpreter: local }, warnings };
}

/** Sin transcripción en el servidor, el cliente dicta con el reconocimiento de voz del navegador. */
export function transcriptionMode(providers: VoiceProviders): VoiceTranscriptionMode {
  return providers.transcriber ? "server" : "browser";
}

let cached: VoiceProviders | undefined;

export function voiceProviders(): VoiceProviders {
  if (!cached) {
    const selection = selectVoiceProviders(env());
    for (const warning of selection.warnings) console.warn(JSON.stringify({ level: "warn", event: "voice_config", message: warning }));
    cached = selection.providers;
  }
  return cached;
}
