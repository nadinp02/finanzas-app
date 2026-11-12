"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeSpeechSegments, speechErrorKind } from "../dictation";
import type { RecordingErrorKind } from "../recording";
import { VOICE_LIMITS } from "../schema";

export type DictationStatus = "idle" | "requesting" | "recording" | "stopping";

/** Lo mínimo de `SpeechRecognition` que se usa (TypeScript no trae la clase: solo existe con prefijo en Safari). */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Chrome, Edge y Safari lo tienen; Firefox no. */
export function isSpeechDictationSupported(): boolean {
  return speechRecognitionConstructor() !== undefined;
}

interface Options {
  onComplete: (text: string) => void;
  onError: (kind: RecordingErrorKind) => void;
}

interface DictationSession {
  recognition: SpeechRecognitionLike;
  finals: string[];
  interim: string;
  startedAt: number;
  timer?: number;
  error: RecordingErrorKind | null;
  cancelled: boolean;
}

function transcriptOf(session: DictationSession): string {
  return mergeSpeechSegments([...session.finals, session.interim]);
}

/**
 * Dictado con el reconocimiento de voz del navegador: lo dicho llega como texto y se interpreta igual
 * que si se hubiera escrito. No necesita clave de OpenAI. Chrome manda el audio a los servidores de
 * Google para reconocerlo; Safari usa el reconocimiento de Apple.
 *
 * - `start()` debe llamarse dentro del toque (iOS exige el gesto para el micrófono).
 * - Corta solo a los 60 s o al llegar al largo máximo de texto.
 * - Si el navegador corta solo (silencio largo), se procesa lo que se llegó a entender.
 */
export function useSpeechDictation({ onComplete, onError }: Options) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState("");

  const callbacks = useRef({ onComplete, onError });
  useEffect(() => {
    callbacks.current = { onComplete, onError };
  });

  const session = useRef<DictationSession | null>(null);

  useEffect(
    () => () => {
      const current = session.current;
      if (!current) return;
      current.cancelled = true;
      if (current.timer) window.clearInterval(current.timer);
      current.recognition.abort();
      session.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    const current = session.current;
    if (!current) return;
    setStatus("stopping");
    current.recognition.stop();
  }, []);

  const start = useCallback(() => {
    if (session.current) return;
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) return callbacks.current.onError("unsupported");
    if (!window.isSecureContext) return callbacks.current.onError("insecure");

    const recognition = new Recognition();
    recognition.lang = "es-AR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const current: DictationSession = { recognition, finals: [], interim: "", startedAt: 0, error: null, cancelled: false };
    session.current = current;

    recognition.onstart = () => {
      if (session.current !== current) return;
      current.startedAt = performance.now();
      setStatus("recording");
      current.timer = window.setInterval(() => {
        const elapsed = performance.now() - current.startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= VOICE_LIMITS.maxDurationMs) stop();
      }, 200);
    };

    recognition.onresult = (event) => {
      if (session.current !== current) return;
      // Se rearma todo en cada evento: los resultados intermedios cambian hasta quedar firmes.
      const finals: string[] = [];
      let interim = "";
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index]!;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finals.push(text);
        else interim += text;
      }
      current.finals = finals;
      current.interim = interim;
      const text = transcriptOf(current);
      setTranscript(text);
      if (text.length >= VOICE_LIMITS.maxTextLength) stop();
    };

    recognition.onerror = (event) => {
      if (session.current !== current) return;
      // "no-speech" solo importa si no se entendió nada: lo decide `onend`.
      current.error ??= speechErrorKind(event.error);
    };

    recognition.onend = () => {
      if (session.current !== current) return;
      if (current.timer) window.clearInterval(current.timer);
      session.current = null;
      setStatus("idle");
      setTranscript("");
      setElapsedMs(0);
      if (current.cancelled) return;
      const text = transcriptOf(current).slice(0, VOICE_LIMITS.maxTextLength).trim();
      if (text.length >= 2 && (current.error === null || current.error === "no_speech")) {
        callbacks.current.onComplete(text);
        return;
      }
      callbacks.current.onError(current.error ?? "no_speech");
    };

    setElapsedMs(0);
    setTranscript("");
    setStatus("requesting");
    try {
      recognition.start();
    } catch {
      session.current = null;
      setStatus("idle");
      callbacks.current.onError("busy");
    }
  }, [stop]);

  /** Corta sin enviar nada. */
  const cancel = useCallback(() => {
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    if (current.timer) window.clearInterval(current.timer);
    session.current = null; // el `onend` que llegue después se ignora
    current.recognition.abort();
    setStatus("idle");
    setTranscript("");
    setElapsedMs(0);
  }, []);

  return { status, elapsedMs, transcript, start, stop, cancel };
}
