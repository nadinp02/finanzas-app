import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  mulDiv,
  parseAmountInput,
  parseDecimal,
  percentChange,
  progressRatio,
  splitInstallments,
  sumCents,
  toDecimal,
} from "./money";

describe("parseDecimal / toDecimal", () => {
  it("convierte strings decimales a centavos exactos", () => {
    expect(parseDecimal("69500.00")).toBe(6_950_000n);
    expect(parseDecimal("69500")).toBe(6_950_000n);
    expect(parseDecimal("0.1")).toBe(10n);
    expect(parseDecimal("-1200.5")).toBe(-120_050n);
    expect(parseDecimal("999999999999.99")).toBe(99_999_999_999_999n);
  });

  it("rechaza formatos ambiguos o con más de dos decimales", () => {
    for (const value of ["", "abc", "1,5", "1.234.567", "1.005", "1e3", "1000000000000"]) {
      expect(() => parseDecimal(value)).toThrow(RangeError);
    }
  });

  it("es reversible", () => {
    for (const value of ["0.00", "0.10", "69500.50", "-1.00", "999999999999.99"]) {
      expect(toDecimal(parseDecimal(value))).toBe(value);
    }
  });

  it("no pierde precisión donde number sí lo haría", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toDecimal(parseDecimal("0.10") + parseDecimal("0.20"))).toBe("0.30");
  });
});

describe("parseAmountInput", () => {
  it.each([
    ["69.500", 6_950_000n],
    ["69500", 6_950_000n],
    ["69.500,50", 6_950_050n],
    ["69500,5", 6_950_050n],
    ["$ 1.234.567", 123_456_700n],
    ["69.5", 6_950n],
    ["69.50", 6_950n],
    ["1.234", 123_400n],
    ["0,99", 99n],
    ["-500", -50_000n],
  ])("lee %s", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "1.23.4", "12,345", "1.2345"])("rechaza %s", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("usa formato argentino y oculta centavos en cero", () => {
    expect(formatMoney(6_950_000n)).toBe("$ 69.500");
    expect(formatMoney(6_950_050n)).toBe("$ 69.500,50");
    expect(formatMoney(6_950_000n, { decimals: "always" })).toBe("$ 69.500,00");
    expect(formatMoney(0n)).toBe("$ 0");
    expect(formatMoney(123_456_789_00n)).toBe("$ 123.456.789");
  });

  it("muestra signos", () => {
    expect(formatMoney(-120_000n)).toBe("−$ 1.200");
    expect(formatMoney(120_000n, { sign: "always" })).toBe("+$ 1.200");
    expect(formatMoney(0n, { sign: "always" })).toBe("$ 0");
    expect(formatMoney(-120_000n, { sign: "never" })).toBe("$ 1.200");
  });

  it("redondea al omitir decimales", () => {
    expect(formatMoney(6_950_050n, { decimals: "never" })).toBe("$ 69.501");
    expect(formatMoney(6_950_049n, { decimals: "never" })).toBe("$ 69.500");
  });

  it("compacta para gráficos", () => {
    expect(formatMoneyCompact(6_950_000n)).toBe("$ 69,5 mil");
    expect(formatMoneyCompact(120_000_000n)).toBe("$ 1,2 M");
    expect(formatMoneyCompact(50_000n)).toBe("$ 500");
  });
});

describe("splitInstallments", () => {
  it("suma exactamente el total y asigna el resto a la primera cuota", () => {
    const parts = splitInstallments(10_000_000n, 3);
    expect(parts).toEqual([3_333_334n, 3_333_333n, 3_333_333n]);
    expect(sumCents(parts)).toBe(10_000_000n);
  });

  it("reparte exacto cuando es divisible", () => {
    expect(splitInstallments(12_000_000n, 3)).toEqual([4_000_000n, 4_000_000n, 4_000_000n]);
  });

  it("valida argumentos", () => {
    expect(() => splitInstallments(100n, 0)).toThrow();
    expect(() => splitInstallments(0n, 3)).toThrow();
  });
});

describe("aritmética", () => {
  it("mulDiv redondea mitad hacia arriba", () => {
    expect(mulDiv(100n, 1n, 3n)).toBe(33n);
    expect(mulDiv(5n, 1n, 2n)).toBe(3n);
    expect(mulDiv(-5n, 1n, 2n)).toBe(-3n);
  });

  it("percentChange no divide por cero", () => {
    expect(percentChange(110n, 100n)).toBeCloseTo(10);
    expect(percentChange(90n, 100n)).toBeCloseTo(-10);
    expect(percentChange(100n, 0n)).toBeNull();
  });

  it("progressRatio queda acotado", () => {
    expect(progressRatio(50n, 100n)).toBe(0.5);
    expect(progressRatio(150n, 100n)).toBe(1);
    expect(progressRatio(-5n, 100n)).toBe(0);
    expect(progressRatio(5n, 0n)).toBe(0);
  });
});
