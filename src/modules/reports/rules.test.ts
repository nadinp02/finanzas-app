import { describe, expect, it } from "vitest";
import {
  changeBetween,
  comparisonRange,
  cumulativeByDay,
  EMPTY_TOTALS,
  expensesByRootCategory,
  projectMonth,
  reportRange,
  totalsFromRows,
  trackedDaysInMonth,
} from "./rules";

const pesos = (value: number) => BigInt(Math.round(value * 100));

describe("totales del período", () => {
  it("separa fijos y variables e ignora transferencias y pagos de tarjeta", () => {
    const totals = totalsFromRows([
      { type: "INCOME", isFixed: true, total: pesos(800_000) },
      { type: "EXPENSE", isFixed: true, total: pesos(250_000) },
      { type: "EXPENSE", isFixed: false, total: pesos(120_000) },
      { type: "TRANSFER", isFixed: false, total: pesos(30_000) },
      { type: "CARD_PAYMENT", isFixed: false, total: pesos(69_500) },
      { type: "ADJUSTMENT", isFixed: false, total: -pesos(2_000) },
    ]);
    expect(totals).toEqual({
      income: pesos(800_000),
      expense: pesos(370_000),
      fixed: pesos(250_000),
      variable: pesos(120_000),
      savings: pesos(430_000),
      adjustments: -pesos(2_000),
    });
  });
});

describe("rangos", () => {
  it("mes en curso: hasta hoy; mes cerrado: hasta el último día", () => {
    expect(reportRange("2026-11", "2026-11-05", "2026-09-01")).toMatchObject({ from: "2026-11-01", to: "2026-11-05", isCurrent: true, beforeTracking: false });
    expect(reportRange("2026-10", "2026-11-05", "2026-09-01")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", isCurrent: false });
  });

  it("el mes del inicio empieza en la fecha de inicio; los anteriores quedan vacíos", () => {
    expect(reportRange("2026-09", "2026-11-05", "2026-09-15")).toMatchObject({ from: "2026-09-15", to: "2026-09-30", beforeTracking: false });
    expect(reportRange("2026-08", "2026-11-05", "2026-09-15").beforeTracking).toBe(true);
  });

  it("no informa meses futuros", () => {
    expect(() => reportRange("2026-12", "2026-11-05", "2026-09-01")).toThrow(RangeError);
  });

  it("compara el mes en curso con el anterior a la misma altura", () => {
    const range = reportRange("2026-11", "2026-11-05", "2026-01-01");
    expect(comparisonRange(range, "2026-01-01")).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("si el mes anterior es más corto, compara hasta su último día", () => {
    const range = reportRange("2026-03", "2026-03-31", "2026-01-01");
    expect(comparisonRange(range, "2026-01-01")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("un mes cerrado se compara con el anterior completo; sin datos previos no hay comparación", () => {
    expect(comparisonRange(reportRange("2026-10", "2026-11-05", "2026-01-01"), "2026-01-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(comparisonRange(reportRange("2026-10", "2026-11-05", "2026-10-01"), "2026-10-01")).toBeNull();
  });

  it("variación absoluta y porcentual", () => {
    expect(changeBetween(pesos(120), pesos(100))).toEqual({ diff: pesos(20), percent: 20 });
    expect(changeBetween(pesos(50), 0n)).toEqual({ diff: pesos(50), percent: null });
  });

  it("días registrados de un mes", () => {
    expect(trackedDaysInMonth("2026-09", "2026-09-21")).toBe(10);
    expect(trackedDaysInMonth("2026-10", "2026-09-21")).toBe(31);
    expect(trackedDaysInMonth("2026-08", "2026-09-21")).toBe(0);
  });
});

describe("proyección al cierre (§8.2)", () => {
  const range = reportRange("2026-11", "2026-11-10", "2026-01-01"); // d = 10, R = 20, N = 30

  it("sin historia proyecta al ritmo actual", () => {
    const totals = totalsFromRows([
      { type: "EXPENSE", isFixed: false, total: pesos(100_000) },
      { type: "EXPENSE", isFixed: true, total: pesos(300_000) },
      { type: "INCOME", isFixed: true, total: pesos(900_000) },
    ]);
    const projection = projectMonth({ range, totals, history: [], expectedExpense: 0n, expectedIncome: 0n });
    // 10.000 por día durante 20 días más.
    expect(projection).toEqual({ variableRemaining: pesos(200_000), expense: pesos(600_000), income: pesos(900_000), savings: pesos(300_000) });
  });

  it("mezcla el ritmo actual con el histórico según el avance del mes", () => {
    const totals = { ...EMPTY_TOTALS, variable: pesos(100_000), expense: pesos(100_000) };
    // Historia: 3 meses, 92 días, 460.000 → 5.000 por día. ritmo = (1/3)·10.000 + (2/3)·5.000 = 6.666,67
    const history = [
      { variable: pesos(150_000), days: 31 },
      { variable: pesos(160_000), days: 30 },
      { variable: pesos(150_000), days: 31 },
    ];
    const projection = projectMonth({ range, totals, history, expectedExpense: 0n, expectedIncome: 0n })!;
    expect(projection.variableRemaining).toBe(pesos(133_333.33));
    expect(projection.expense).toBe(pesos(233_333.33));
  });

  it("una compra grande al principio del mes no dispara la proyección", () => {
    const early = reportRange("2026-11", "2026-11-02", "2026-01-01");
    const totals = { ...EMPTY_TOTALS, variable: pesos(500_000), expense: pesos(500_000) };
    const history = [{ variable: pesos(300_000), days: 30 }];
    const projection = projectMonth({ range: early, totals, history, expectedExpense: 0n, expectedIncome: 0n })!;
    const naive = projectMonth({ range: early, totals, history: [], expectedExpense: 0n, expectedIncome: 0n })!;
    expect(projection.expense).toBeLessThan(naive.expense / 3n);
  });

  it("suma los pendientes esperados y no proyecta meses cerrados", () => {
    const totals = { ...EMPTY_TOTALS, income: pesos(100_000), savings: pesos(100_000) };
    const projection = projectMonth({ range, totals, history: [], expectedExpense: pesos(40_000), expectedIncome: pesos(50_000) })!;
    expect(projection).toMatchObject({ expense: pesos(40_000), income: pesos(150_000), savings: pesos(110_000) });
    const closed = reportRange("2026-10", "2026-11-10", "2026-01-01");
    expect(projectMonth({ range: closed, totals, history: [], expectedExpense: 0n, expectedIncome: 0n })).toBeNull();
  });

  it("el último día del mes no proyecta gasto extra", () => {
    const last = reportRange("2026-11", "2026-11-30", "2026-01-01");
    const totals = { ...EMPTY_TOTALS, variable: pesos(90_000), expense: pesos(90_000) };
    expect(projectMonth({ range: last, totals, history: [], expectedExpense: 0n, expectedIncome: 0n })!.expense).toBe(pesos(90_000));
  });

  it("si el registro empezó este mes, el ritmo usa solo los días registrados", () => {
    const started = reportRange("2026-11", "2026-11-10", "2026-11-06"); // 5 días registrados
    const totals = { ...EMPTY_TOTALS, variable: pesos(50_000), expense: pesos(50_000) };
    expect(projectMonth({ range: started, totals, history: [], expectedExpense: 0n, expectedIncome: 0n })!.variableRemaining).toBe(pesos(200_000));
  });
});

describe("gasto por categoría", () => {
  const categories = [
    { id: "salud", name: "Salud", parentId: null, icon: "heart", color: "red" },
    { id: "farmacia", name: "Farmacia", parentId: "salud", icon: "pill", color: "red" },
    { id: "super", name: "Supermercado", parentId: null, icon: "cart", color: "green" },
  ];

  it("las subcategorías suman en su categoría raíz, de mayor a menor", () => {
    const result = expensesByRootCategory(
      [
        { categoryId: "farmacia", total: pesos(30_000) },
        { categoryId: "salud", total: pesos(20_000) },
        { categoryId: "super", total: pesos(150_000) },
      ],
      categories,
    );
    expect(result.map(({ id, amount, share }) => ({ id, amount, share }))).toEqual([
      { id: "super", amount: pesos(150_000), share: 0.75 },
      { id: "salud", amount: pesos(50_000), share: 0.25 },
    ]);
  });
});

describe("gasto acumulado por día", () => {
  it("acumula hasta hoy y deja el resto del mes vacío", () => {
    const daily = new Map([
      ["2026-11-01", pesos(1_000)],
      ["2026-11-03", pesos(500)],
    ]);
    const series = cumulativeByDay("2026-11", daily, "2026-11-01", "2026-11-04");
    expect(series.slice(0, 5)).toEqual([pesos(1_000), pesos(1_000), pesos(1_500), pesos(1_500), null]);
    expect(series).toHaveLength(30);
  });

  it("los días anteriores al inicio del registro quedan vacíos", () => {
    const series = cumulativeByDay("2026-09", new Map([["2026-09-21", pesos(100)]]), "2026-09-21", "2026-09-30");
    expect(series[19]).toBeNull();
    expect(series[20]).toBe(pesos(100));
  });
});
