/**
 * Decisiones de la grabación que no dependen del navegador concreto (se prueban sin DOM).
 */

/**
 * Formatos en orden de preferencia. Safari (iOS ≥ 14.3) solo graba `audio/mp4`; Chrome y Android,
 * `audio/webm;codecs=opus`. Todos los acepta la transcripción.
 */
export const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"] as const;

/** El primer formato soportado, o `undefined` para dejar elegir al navegador. */
export function pickRecordingMimeType(isTypeSupported: (type: string) => boolean): string | undefined {
  for (const type of RECORDING_MIME_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // Algunos navegadores lanzan con tipos desconocidos.
    }
  }
  return undefined;
}

export type RecordingErrorKind =
  | "unsupported"
  | "insecure"
  | "denied"
  | "no_device"
  | "busy"
  | "interrupted"
  | "too_short"
  | "no_speech"
  | "network";

export const RECORDING_ERROR_MESSAGES: Record<RecordingErrorKind, string> = {
  unsupported: "Este navegador no permite grabar audio. Podés escribir el movimiento.",
  insecure: "El micrófono solo funciona con conexión segura (https). Podés escribir el movimiento.",
  denied: "No hay permiso para usar el micrófono. En iPhone: Ajustes › Safari › Micrófono › Permitir. También podés escribir el movimiento.",
  no_device: "No encontramos un micrófono en este dispositivo.",
  busy: "El micrófono está en uso por otra app. Cerrala y probá de nuevo.",
  interrupted: "Se cortó la grabación. Probá de nuevo.",
  too_short: "La grabación fue muy corta. Tocá el micrófono y contá qué gastaste o cobraste.",
  no_speech: "No te escuchamos. Tocá el micrófono y contá qué gastaste o cobraste.",
  network: "El dictado necesita conexión a internet. Probá de nuevo o escribí el movimiento.",
};

/** Traduce los errores de `getUserMedia` / `MediaRecorder`. */
export function recordingErrorKind(error: unknown): RecordingErrorKind {
  const name = error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException) ? (error as Error).name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no_device";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "NotSupportedError":
    case "TypeError":
      return "unsupported";
    default:
      return "interrupted";
  }
}

/** "0:07" */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
