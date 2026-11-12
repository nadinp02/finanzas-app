import { describe, expect, it } from "vitest";
import { amountsIn, findAmounts, findInstallments, parseDigits } from "./numbers";

const pesos = (value: number) => BigInt(Math.round(value * 100));

describe("importes en palabras", () => {
  it.each([
    ["cincuenta mil", 50_000],
    ["sesenta y nueve mil quinientos", 69_500],
    ["treinta y dos mil", 32_000],
    ["ciento cincuenta mil", 150_000],
    ["cien mil", 100_000],
    ["mil", 1_000],
    ["mil quinientos", 1_500],
    ["dos mil quinientos cincuenta", 2_550],
    ["doce mil quinientos", 12_500],
    ["veintitrés mil", 23_000],
    ["un millón doscientos mil", 1_200_000],
    ["dos millones", 2_000_000],
    ["un millón y medio", 1_500_000],
    ["medio millón", 500_000],
    ["novecientos noventa y nueve", 999],
    ["quinientas", 500],
  ])("«%s» → %d", (text, expected) => {
    expect(amountsIn(text)).toEqual([pesos(expected)]);
  });

  it("acepta centavos con «con»", () => {
    expect(amountsIn("mil doscientos con cincuenta")).toEqual([pesos(1_200.5)]);
    expect(amountsIn("mil doscientos con cuarenta y cinco centavos en el kiosco")).toEqual([pesos(1_200.45)]);
    // "con dos tarjetas" no son centavos.
    expect(amountsIn("mil con dos tarjetas")).toEqual([pesos(1_000)]);
  });

  it("usa la jerga habitual: lucas, palos, k", () => {
    expect(amountsIn("cincuenta lucas")).toEqual([pesos(50_000)]);
    expect(amountsIn("50 lucas")).toEqual([pesos(50_000)]);
    expect(amountsIn("un palo")).toEqual([pesos(1_000_000)]);
    expect(amountsIn("medio palo")).toEqual([pesos(500_000)]);
    expect(amountsIn("50k")).toEqual([pesos(50_000)]);
  });
});

describe("importes con dígitos (como los escribe la transcripción)", () => {
  it.each([
    ["$50.000", 50_000],
    ["$ 32.000", 32_000],
    ["50000", 50_000],
    ["1.500.000", 1_500_000],
    ["69.500,50", 69_500.5],
    ["50,000", 50_000],
    ["50 mil", 50_000],
    ["1,5 millones", 1_500_000],
    ["2.5 millones", 2_500_000],
    ["50 000", 50_000],
  ])("«%s» → %d", (text, expected) => {
    expect(amountsIn(text)).toEqual([pesos(expected)]);
  });

  it("interpreta formatos de dígitos", () => {
    expect(parseDigits("1.234,56")).toBe(123_456n);
    expect(parseDigits("69,5")).toBe(6_950n);
    expect(parseDigits("1.2.3")).toBeNull();
  });
});

describe("varios importes y contexto", () => {
  it("encuentra todos los importes de una frase (caso 17)", () => {
    expect(amountsIn("Nafta cincuenta mil, supermercado treinta y dos mil")).toEqual([pesos(50_000), pesos(32_000)]);
    expect(amountsIn("Nafta $50.000, supermercado $32.000.")).toEqual([pesos(50_000), pesos(32_000)]);
    expect(amountsIn("gasté 50 mil en nafta y 32 mil en el super")).toEqual([pesos(50_000), pesos(32_000)]);
  });

  it("devuelve posiciones sobre el texto original", () => {
    const text = "Farmacity sesenta y nueve mil quinientos";
    const [match] = findAmounts(text);
    expect(text.slice(match!.start, match!.end)).toBe("sesenta y nueve mil quinientos");
  });

  it("un artículo no es un importe", () => {
    expect(amountsIn("me ingresaron un pago de ciento cincuenta mil")).toEqual([pesos(150_000)]);
    expect(amountsIn("compré una pizza")).toEqual([]);
  });

  it("descarta cuotas, fechas, horas y plazos", () => {
    expect(amountsIn("una tele de 300 mil en 6 cuotas")).toEqual([pesos(300_000)]);
    expect(amountsIn("el 15 de octubre pagué 20 mil")).toEqual([pesos(20_000)]);
    expect(amountsIn("15 de octubre")).toEqual([]);
    expect(amountsIn("el 3/11 gasté 5 mil")).toEqual([pesos(5_000)]);
    expect(amountsIn("hace 3 días gasté 8 mil")).toEqual([pesos(8_000)]);
    expect(amountsIn("a las 8 tomé un café de 3 mil")).toEqual([pesos(3_000)]);
    expect(amountsIn("50 litros de nafta 70 mil")).toEqual([pesos(70_000)]);
  });

  it("no une números separados por puntuación", () => {
    expect(amountsIn("nafta 50, super 32")).toEqual([pesos(50), pesos(32)]);
  });

  it("detecta cuotas", () => {
    expect(findInstallments("en 3 cuotas")).toEqual([3]);
    expect(findInstallments("en doce cuotas sin interés")).toEqual([12]);
    expect(findInstallments("en treinta y seis cuotas")).toEqual([36]);
    expect(findInstallments("en 6 pagos")).toEqual([6]);
    expect(findInstallments("una cuota")).toEqual([]);
  });
});
