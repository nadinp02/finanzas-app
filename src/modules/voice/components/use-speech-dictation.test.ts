// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VOICE_LIMITS } from "../schema";
import { isSpeechDictationSupported, useSpeechDictation } from "./use-speech-dictation";

/** Reconocimiento falso: la prueba dispara los eventos a mano. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;

  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }

  emitStart() {
    this.onstart?.();
  }
  /** Cada resultado: [texto, ¿final?]. */
  emitResults(results: [string, boolean][]) {
    const list = results.map(([transcript, isFinal]) => Object.assign([{ transcript, confidence: 0.9 }], { isFinal }));
    this.onresult?.({ results: list });
  }
  emitError(error: string) {
    this.onerror?.({ error });
  }
  emitEnd() {
    this.onend?.();
  }
}

function setup() {
  const onComplete = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() => useSpeechDictation({ onComplete, onError }));
  return { hook, onComplete, onError };
}

beforeEach(() => {
  FakeRecognition.last = null;
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
  vi.stubGlobal("isSecureContext", true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSpeechDictation", () => {
  it("detecta el soporte del navegador", () => {
    expect(isSpeechDictationSupported()).toBe(true);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    expect(isSpeechDictationSupported()).toBe(false);
  });

  it("dicta en castellano rioplatense y entrega el texto al terminar", () => {
    const { hook, onComplete, onError } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    expect(recognition).toMatchObject({ started: true, lang: "es-AR", continuous: true, interimResults: true });
    expect(hook.result.current.status).toBe("requesting");

    act(() => recognition.emitStart());
    expect(hook.result.current.status).toBe("recording");

    act(() => recognition.emitResults([["Nafta 50 mil", true], [" supermercado", false]]));
    expect(hook.result.current.transcript).toBe("Nafta 50 mil supermercado");

    act(() => hook.result.current.stop());
    expect(recognition.stopped).toBe(true);
    expect(hook.result.current.status).toBe("stopping");

    act(() => {
      recognition.emitResults([["Nafta 50 mil", true], [" supermercado 32 mil", true]]);
      recognition.emitEnd();
    });
    expect(onComplete).toHaveBeenCalledWith("Nafta 50 mil supermercado 32 mil");
    expect(onError).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe("idle");
  });

  it("si el navegador corta solo, procesa lo que entendió", () => {
    const { hook, onComplete } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    act(() => {
      recognition.emitStart();
      recognition.emitResults([["súper 32 mil", true]]);
      recognition.emitError("no-speech");
      recognition.emitEnd();
    });
    expect(onComplete).toHaveBeenCalledWith("súper 32 mil");
  });

  it("sin nada entendido avisa que no se escuchó", () => {
    const { hook, onComplete, onError } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    act(() => {
      recognition.emitStart();
      recognition.emitError("no-speech");
      recognition.emitEnd();
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("no_speech");
  });

  it("permiso denegado", () => {
    const { hook, onComplete, onError } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    act(() => {
      recognition.emitError("not-allowed");
      recognition.emitEnd();
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("denied");
  });

  it("cancelar no envía nada", () => {
    const { hook, onComplete, onError } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    act(() => {
      recognition.emitStart();
      recognition.emitResults([["nafta 50 mil", true]]);
    });
    act(() => hook.result.current.cancel());
    expect(recognition.aborted).toBe(true);
    expect(hook.result.current.status).toBe("idle");
    act(() => recognition.emitEnd());
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("corta solo a los 60 segundos", () => {
    vi.useFakeTimers();
    const { hook } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    act(() => recognition.emitStart());
    act(() => vi.advanceTimersByTime(VOICE_LIMITS.maxDurationMs + 500));
    expect(recognition.stopped).toBe(true);
  });

  it("corta al llegar al largo máximo de texto y no lo excede", () => {
    const { hook, onComplete } = setup();
    act(() => hook.result.current.start());
    const recognition = FakeRecognition.last!;
    const long = "nafta 50 mil ".repeat(60);
    act(() => {
      recognition.emitStart();
      recognition.emitResults([[long, true]]);
    });
    expect(recognition.stopped).toBe(true);
    act(() => recognition.emitEnd());
    expect(onComplete.mock.calls[0]![0].length).toBeLessThanOrEqual(VOICE_LIMITS.maxTextLength);
  });

  it("sin soporte avisa sin romper", () => {
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    const { hook, onError } = setup();
    act(() => hook.result.current.start());
    expect(onError).toHaveBeenCalledWith("unsupported");
    expect(hook.result.current.status).toBe("idle");
  });
});
