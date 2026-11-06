import { describe, expect, it } from "vitest";
import { sumCents } from "@/lib/money";
import {
  buildInstallmentSchedule,
  closingDate,
  computeCardStatus,
  dueDate,
  periodOf,
  type CardCycleConfig,
  type CardLedgerInput,
} from "./rules";

const config: CardCycleConfig = { closingDay: 26, dueDay: 7 };

const pesos = (value: number) => BigInt(Math.round(value * 100));

function ledger(overrides: Partial<CardLedgerInput> = {}): CardLedgerInput {
  return {
    config,
    openingDate: "2026-10-01",
    openingStatementBalance: 0n,
    openingUnbilledBalance: 0n,
    charges: [],
    installments: [],
    payments: [],
    adjustments: [],
    ...overrides,
  };
}

describe("ciclo de la tarjeta", () => {
  it("las compras hasta el cierre inclusive entran en el resumen del mes", () => {
    expect(periodOf(config, "2026-11-26")).toBe("2026-11");
    expect(periodOf(config, "2026-11-27")).toBe("2026-12");
    expect(periodOf(config, "2026-12-30")).toBe("2027-01");
  });

  it("vence el mes siguiente si el día de vencimiento es anterior al de cierre", () => {
    expect(closingDate(config, "2026-11")).toBe("2026-11-26");
    expect(dueDate(config, "2026-11")).toBe("2026-12-07");
    const sameMonth: CardCycleConfig = { closingDay: 5, dueDay: 15 };
    expect(dueDate(sameMonth, "2026-11")).toBe("2026-11-15");
  });

  it("acota el cierre al último día del mes", () => {
    const endOfMonth: CardCycleConfig = { closingDay: 31, dueDay: 10 };
    expect(closingDate(endOfMonth, "2026-02")).toBe("2026-02-28");
    expect(periodOf(endOfMonth, "2026-02-28")).toBe("2026-02");
    expect(periodOf(endOfMonth, "2026-03-01")).toBe("2026-03");
  });

  it("respeta las fechas ajustadas de un resumen", () => {
    const withOverride: CardCycleConfig = {
      ...config,
      overrides: new Map([["2026-11", { closingDate: "2026-11-23", dueDate: "2026-12-04" }]]),
    };
    expect(periodOf(withOverride, "2026-11-24")).toBe("2026-12");
    expect(periodOf(withOverride, "2026-11-23")).toBe("2026-11");
    expect(dueDate(withOverride, "2026-11")).toBe("2026-12-04");
  });
});

describe("cuotas", () => {
  it("reparte el total y factura una cuota por resumen", () => {
    const schedule = buildInstallmentSchedule(pesos(100_000), 3, "2026-11");
    expect(schedule.map((item) => item.period)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(schedule.map((item) => item.amount)).toEqual([pesos(33_333.34), pesos(33_333.33), pesos(33_333.33)]);
    expect(sumCents(schedule.map((item) => item.amount))).toBe(pesos(100_000));
  });
});

describe("estado de la tarjeta", () => {
  it("compra y pago total: la deuda vuelve a cero", () => {
    const purchase = { date: "2026-10-10", amount: pesos(69_500) };
    const beforePayment = computeCardStatus(ledger({ charges: [purchase] }), "2026-10-20");
    expect(beforePayment.totalDebt).toBe(pesos(69_500));
    expect(beforePayment.currentPeriod).toMatchObject({ period: "2026-10", charges: pesos(69_500) });

    const afterClosing = computeCardStatus(ledger({ charges: [purchase] }), "2026-10-30");
    expect(afterClosing.lastStatement).toMatchObject({
      period: "2026-10",
      balance: pesos(69_500),
      remaining: pesos(69_500),
      dueDate: "2026-11-07",
      status: "unpaid",
    });

    const paid = computeCardStatus(
      ledger({ charges: [purchase], payments: [{ date: "2026-11-05", amount: pesos(69_500) }] }),
      "2026-11-05",
    );
    expect(paid.totalDebt).toBe(0n);
    expect(paid.lastStatement).toMatchObject({ remaining: 0n, status: "paid" });
  });

  it("pago parcial: el remanente sigue a pagar y se arrastra al próximo resumen", () => {
    const october = { date: "2026-10-10", amount: pesos(100_000) };
    const partialPayment = { date: "2026-11-05", amount: pesos(30_000) };

    const beforeDue = computeCardStatus(ledger({ charges: [october], payments: [partialPayment] }), "2026-11-06");
    expect(beforeDue.lastStatement).toMatchObject({
      balance: pesos(100_000),
      paid: pesos(30_000),
      remaining: pesos(70_000),
      status: "partial",
    });
    expect(beforeDue.totalDebt).toBe(pesos(70_000));

    const input = ledger({
      charges: [october, { date: "2026-11-10", amount: pesos(20_000) }],
      payments: [partialPayment],
    });
    const afterDue = computeCardStatus(input, "2026-11-10");
    expect(afterDue.lastStatement).toMatchObject({ remaining: pesos(70_000), status: "overdue" });
    expect(afterDue.currentPeriod.charges).toBe(pesos(20_000));
    expect(afterDue.totalDebt).toBe(pesos(90_000));

    // Al cerrar noviembre, el resumen incluye lo impago de octubre más los consumos nuevos.
    const nextMonth = computeCardStatus(input, "2026-11-30");
    expect(nextMonth.lastStatement).toMatchObject({ period: "2026-11", balance: pesos(90_000), remaining: pesos(90_000) });
  });

  it("deuda inicial: resumen impago, consumos sin facturar y cuotas previas", () => {
    const status = computeCardStatus(
      ledger({
        openingDate: "2026-11-04",
        openingStatementBalance: pesos(300_000),
        openingUnbilledBalance: pesos(80_000),
        installments: [
          { period: "2026-11", amount: pesos(50_000) },
          { period: "2026-12", amount: pesos(50_000) },
        ],
      }),
      "2026-11-04",
    );
    expect(status.lastStatement).toMatchObject({ period: "2026-10", balance: pesos(300_000), remaining: pesos(300_000) });
    expect(status.currentPeriod.charges).toBe(pesos(130_000));
    expect(status.futureInstallments).toBe(pesos(50_000));
    expect(status.totalDebt).toBe(pesos(480_000));
  });

  it("compra en cuotas: la deuda total incluye las cuotas futuras", () => {
    const schedule = buildInstallmentSchedule(pesos(120_000), 3, periodOf(config, "2026-11-01"));
    const status = computeCardStatus(ledger({ installments: schedule }), "2026-11-02");
    expect(status.totalDebt).toBe(pesos(120_000));
    expect(status.currentPeriod.charges).toBe(pesos(40_000));
    expect(status.futureInstallments).toBe(pesos(80_000));
    expect(status.futureInstallmentsByPeriod).toEqual([
      { period: "2026-12", amount: pesos(40_000) },
      { period: "2027-01", amount: pesos(40_000) },
    ]);
  });

  it("pagar de más deja saldo a favor y un ajuste positivo baja la deuda", () => {
    const status = computeCardStatus(
      ledger({
        charges: [{ date: "2026-10-10", amount: pesos(10_000) }],
        payments: [{ date: "2026-11-01", amount: pesos(15_000) }],
        adjustments: [{ date: "2026-11-02", amount: pesos(1_000) }],
      }),
      "2026-11-03",
    );
    expect(status.lastStatement).toMatchObject({ remaining: 0n, creditBalance: pesos(5_000) });
    expect(status.totalDebt).toBe(-pesos(6_000));
  });

  it("calcula el límite disponible", () => {
    const status = computeCardStatus(
      ledger({ charges: [{ date: "2026-10-10", amount: pesos(250_000) }], creditLimit: pesos(1_000_000) }),
      "2026-10-11",
    );
    expect(status.availableLimit).toBe(pesos(750_000));
  });
});
