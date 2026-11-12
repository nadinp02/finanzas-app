import { describe, expect, it } from "vitest";
import { mergeSpeechSegments, speechErrorKind } from "./dictation";
import { interpretLocally } from "./interpret-local";
import { testContext } from "./test-context";

describe("mergeSpeechSegments", () => {
  it("une tramos sucesivos", () => {
    expect(mergeSpeechSegments(["Nafta 50 mil", " supermercado 32 mil"])).toBe("Nafta 50 mil supermercado 32 mil");
  });

  it("reemplaza los tramos acumulativos de Chrome en Android", () => {
    expect(mergeSpeechSegments(["nafta", "nafta 50 mil", "nafta 50 mil supermercado 32 mil"])).toBe("nafta 50 mil supermercado 32 mil");
  });

  it("no repite un tramo que ya está al final", () => {
    expect(mergeSpeechSegments(["nafta 50 mil", "50 mil"])).toBe("nafta 50 mil");
  });

  it("ignora tramos vacíos y normaliza espacios", () => {
    expect(mergeSpeechSegments(["", "  nafta   50 mil ", "   "])).toBe("nafta 50 mil");
    expect(mergeSpeechSegments([])).toBe("");
  });
});

describe("speechErrorKind", () => {
  it("traduce los errores del reconocimiento", () => {
    expect(speechErrorKind("not-allowed")).toBe("denied");
    expect(speechErrorKind("service-not-allowed")).toBe("denied");
    expect(speechErrorKind("audio-capture")).toBe("no_device");
    expect(speechErrorKind("no-speech")).toBe("no_speech");
    expect(speechErrorKind("network")).toBe("network");
    expect(speechErrorKind("language-not-supported")).toBe("unsupported");
    expect(speechErrorKind("algo-nuevo")).toBe("interrupted");
  });

  it("cancelar no es una falla", () => {
    expect(speechErrorKind("aborted")).toBeNull();
  });
});

describe("texto dictado por el navegador con el intérprete local", () => {
  const ctx = testContext();

  it("entiende los importes con cifras y signo de pesos", () => {
    // Chrome y Safari suelen devolver cifras, no palabras.
    expect(interpretLocally("Nafta $50.000 supermercado $32.000", ctx).map((item) => item.amount)).toEqual(["50000.00", "32000.00"]);
    expect(interpretLocally("nafta 50000 pesos y supermercado 32000 pesos", ctx).map((item) => item.amount)).toEqual(["50000.00", "32000.00"]);
    expect(interpretLocally("Farmacity $69,500 con la visa", ctx)).toEqual([
      expect.objectContaining({ amount: "69500.00", merchant: "Farmacity", accountMention: "visa" }),
    ]);
  });
});
