"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_LIMITS } from "../schema";
import { pickRecordingMimeType, recordingErrorKind, type RecordingErrorKind } from "../recording";

export type RecorderStatus = "idle" | "requesting" | "recording" | "stopping";

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

interface Options {
  onComplete: (recording: Recording) => void;
  onError: (kind: RecordingErrorKind) => void;
}

type AudioContextConstructor = typeof AudioContext;

interface RecordingSession {
  stream?: MediaStream;
  recorder?: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  timer?: number;
  frame?: number;
  context?: AudioContext;
  cancelled: boolean;
  mimeType?: string;
}

/**
 * Grabación con MediaRecorder pensada para Safari en iPhone:
 * - `start()` debe llamarse dentro del toque (iOS exige el gesto para el micrófono y el AudioContext).
 * - Graba en fragmentos de 1 s (Safari a veces no entrega datos sin `timeslice`).
 * - Corta solo a los 60 s y libera el micrófono al terminar (se apaga el indicador del sistema).
 * - El audio queda solo en memoria.
 */
export function useVoiceRecorder({ onComplete, onError }: Options) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);

  const callbacks = useRef({ onComplete, onError });
  useEffect(() => {
    callbacks.current = { onComplete, onError };
  });

  const session = useRef<RecordingSession | null>(null);

  const cleanup = useCallback(() => {
    const current = session.current;
    if (!current) return;
    if (current.timer) window.clearInterval(current.timer);
    if (current.frame) cancelAnimationFrame(current.frame);
    current.stream?.getTracks().forEach((track) => track.stop());
    void current.context?.close().catch(() => {});
    session.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    if (session.current) session.current.cancelled = true;
    if (session.current?.recorder?.state === "recording") session.current.recorder.stop();
    cleanup();
  }, [cleanup]);

  const fail = useCallback(
    (kind: RecordingErrorKind) => {
      cleanup();
      setStatus("idle");
      callbacks.current.onError(kind);
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    const recorder = session.current?.recorder;
    if (recorder && recorder.state === "recording") {
      setStatus("stopping");
      recorder.stop();
    }
  }, []);

  const start = useCallback(() => {
    if (session.current) return;
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) return fail("insecure");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return fail("unsupported");

    const current: RecordingSession = { chunks: [], startedAt: 0, cancelled: false };
    session.current = current;
    // El AudioContext se crea dentro del toque: iOS no lo deja arrancar después.
    try {
      const Context = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext) as AudioContextConstructor | undefined;
      if (Context) {
        current.context = new Context();
        void current.context.resume().catch(() => {});
      }
    } catch {
      current.context = undefined;
    }
    setElapsedMs(0);
    setStatus("requesting");

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        if (current.cancelled || session.current !== current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        current.stream = stream;
        const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
        current.recorder = recorder;
        current.mimeType = recorder.mimeType || mimeType;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) current.chunks.push(event.data);
        };
        recorder.onerror = () => fail("interrupted");
        recorder.onstop = () => {
          const durationMs = performance.now() - current.startedAt;
          const type = (current.mimeType || current.chunks[0]?.type || "audio/webm").split(";")[0]!;
          const blob = new Blob(current.chunks, { type });
          const cancelled = current.cancelled;
          cleanup();
          setStatus("idle");
          if (cancelled) return;
          if (durationMs < VOICE_LIMITS.minDurationMs || blob.size === 0) callbacks.current.onError("too_short");
          else callbacks.current.onComplete({ blob, mimeType: type, durationMs });
        };
        // Si la pista se corta (llamada entrante, otra app toma el micrófono), se termina lo grabado.
        stream.getAudioTracks()[0]?.addEventListener("ended", () => {
          if (recorder.state === "recording") recorder.stop();
        });

        recorder.start(1000);
        current.startedAt = performance.now();
        setStatus("recording");
        current.timer = window.setInterval(() => {
          const elapsed = performance.now() - current.startedAt;
          setElapsedMs(elapsed);
          if (elapsed >= VOICE_LIMITS.maxDurationMs && recorder.state === "recording") {
            setStatus("stopping");
            recorder.stop();
          }
        }, 200);

        // Nivel de entrada para mostrar que se está escuchando (opcional: si falla, se graba igual).
        const context = current.context;
        if (context) {
          try {
            const analyser = context.createAnalyser();
            analyser.fftSize = 512;
            context.createMediaStreamSource(stream).connect(analyser);
            const samples = new Uint8Array(analyser.fftSize);
            let last = 0;
            const tick = (time: number) => {
              if (session.current !== current) return;
              if (time - last > 80) {
                last = time;
                analyser.getByteTimeDomainData(samples);
                let sum = 0;
                for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
                setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
              }
              current.frame = requestAnimationFrame(tick);
            };
            current.frame = requestAnimationFrame(tick);
          } catch {
            // Sin medidor de nivel.
          }
        }
      })
      .catch((error: unknown) => {
        if (session.current === current) fail(recordingErrorKind(error));
      });
  }, [cleanup, fail]);

  /** Corta sin enviar nada. */
  const cancel = useCallback(() => {
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    if (current.recorder?.state === "recording") current.recorder.stop();
    else {
      cleanup();
      setStatus("idle");
    }
  }, [cleanup]);

  return { status, elapsedMs, level, start, stop, cancel };
}
