/**
 * Dictado con el reconocimiento de voz del navegador (Web Speech API): gratis y sin claves. Lo que
 * no depende del navegador concreto vive acá para probarlo sin DOM.
 */
import type { RecordingErrorKind } from "./recording";

/**
 * Une los resultados finales del reconocimiento. Chrome en Android, con `continuous`, a veces entrega
 * cada resultado con todo lo dicho hasta ese momento ("nafta", "nafta 50 mil", …): si un tramo
 * repite el texto acumulado, lo reemplaza en lugar de sumarse.
 */
export function mergeSpeechSegments(segments: readonly string[]): string {
  let merged = "";
  for (const raw of segments) {
    const segment = raw.trim().replace(/\s+/g, " ");
    if (!segment) continue;
    const current = merged.toLowerCase();
    const next = segment.toLowerCase();
    if (!merged || next.startsWith(current)) merged = segment;
    else if (!current.endsWith(next)) merged = `${merged} ${segment}`;
  }
  return merged;
}

/** Traduce el `error` de `SpeechRecognitionErrorEvent`. `null`: no es una falla (se canceló). */
export function speechErrorKind(code: string): RecordingErrorKind | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "no_device";
    case "no-speech":
      return "no_speech";
    case "network":
      return "network";
    case "language-not-supported":
    case "bad-grammar":
      return "unsupported";
    default:
      return "interrupted";
  }
}
