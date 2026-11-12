import { describe, expect, it } from "vitest";
import { formatElapsed, pickRecordingMimeType, recordingErrorKind } from "./recording";

describe("grabación", () => {
  it("elige el formato que soporta cada navegador", () => {
    // Chrome / Android
    expect(pickRecordingMimeType((type) => type.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    // Safari en iPhone: solo mp4
    expect(pickRecordingMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    // Ninguno conocido: decide el navegador
    expect(pickRecordingMimeType(() => false)).toBeUndefined();
    // isTypeSupported que lanza con tipos desconocidos
    expect(pickRecordingMimeType((type) => {
      if (type.includes("codecs")) throw new Error("tipo desconocido");
      return type === "audio/mp4";
    })).toBe("audio/mp4");
  });

  it("traduce los errores del micrófono", () => {
    expect(recordingErrorKind(new DOMException("x", "NotAllowedError"))).toBe("denied");
    expect(recordingErrorKind(new DOMException("x", "NotFoundError"))).toBe("no_device");
    expect(recordingErrorKind(new DOMException("x", "NotReadableError"))).toBe("busy");
    expect(recordingErrorKind(new TypeError("x"))).toBe("unsupported");
    expect(recordingErrorKind("raro")).toBe("interrupted");
  });

  it("muestra el tiempo grabado", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7_400)).toBe("0:07");
    expect(formatElapsed(60_000)).toBe("1:00");
  });
});
