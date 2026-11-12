import { interpretLocally, LOCAL_INTERPRETER_MODEL } from "../interpret-local";
import type { InterpretationRequest, InterpretationResult, Transcriber, Transcription, TransactionInterpreter } from "./types";

/** Intérprete por reglas, sin servicios externos. Siempre requiere revisión. */
export class LocalInterpreter implements TransactionInterpreter {
  readonly id = "local";
  readonly local = true;

  async interpret({ transcript, context }: InterpretationRequest): Promise<InterpretationResult> {
    return { items: interpretLocally(transcript, context), model: LOCAL_INTERPRETER_MODEL };
  }
}

/**
 * Transcripción falsa para pruebas automatizadas (`VOICE_STT_PROVIDER=fake`): devuelve una frase fija
 * sin llamar a ningún servicio. No es una integración: solo permite probar el resto del flujo.
 */
export class FakeTranscriber implements Transcriber {
  readonly id = "fake";

  constructor(private readonly transcript: string) {}

  async transcribe(): Promise<Transcription> {
    return { text: this.transcript, model: "fake" };
  }
}
