import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { adjustBalance, createAccount } from "@/modules/accounts/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { getDashboard, getNetWorthBreakdown } from "@/modules/reports/service";
import { deleteTransaction } from "@/modules/transactions/service";
import { createTransaction } from "@/modules/transactions/service";
import { categoryId, createTestUser } from "../support/factories";
import { pesos, record, setupFinance, TODAY } from "../support/finance";

/** Usuaria de setupFinance (inicio 1/10/2026): efectivo 50.000, banco 500.000, Visa sin deuda. */
const START = "2026-10-01";
const dashboard = (userId: string, month?: string, today = TODAY) => getDashboard({ id: userId, trackingStartDate: START }, month, today);

describe("informe mensual", () => {
  it("caso 15: ahorro mensual = ingresos − gastos; transferencias, pagos y ajustes no cuentan", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "INCOME", amount: "800000", date: "2026-11-01", accountId: f.bank, categoryId: f.categories.sueldo });
    await record(f.userId, { type: "EXPENSE", amount: "250000", date: "2026-11-02", accountId: f.bank, categoryId: f.categories.otros, isFixed: true });
    await record(f.userId, { type: "EXPENSE", amount: "69500", date: "2026-11-03", accountId: f.card, categoryId: f.categories.farmacia });
    await record(f.userId, { type: "TRANSFER", amount: "30000", date: "2026-11-03", accountId: f.bank, toAccountId: f.cash });
    await record(f.userId, { type: "CARD_PAYMENT", amount: "10000", date: "2026-11-04", accountId: f.bank, toAccountId: f.card });
    await adjustBalance(f.userId, f.cash, "79000", TODAY); // 80.000 → 79.000

    const report = await dashboard(f.userId);
    expect(report).toMatchObject({ month: "2026-11", isCurrentMonth: true, range: { from: "2026-11-01", to: TODAY } });
    expect(report.totals).toEqual({
      income: "800000.00",
      expense: "319500.00",
      fixed: "250000.00",
      variable: "69500.00",
      savings: "480500.00",
      adjustments: "-1000.00",
    });
    // Farmacia es subcategoría de Salud: suma en su raíz.
    expect(report.categories.map(({ name, amount }) => ({ name, amount }))).toEqual([
      { name: "Otros", amount: "250000.00" },
      { name: "Salud", amount: "69500.00" },
    ]);
    expect(report.dailyExpense[1]).toEqual({ day: 2, current: "250000.00", previous: "0.00" });
    expect(report.dailyExpense[3]?.current).toBe("319500.00");
    expect(report.dailyExpense[4]?.current).toBeNull();
    expect(report.recent).toHaveLength(5);
  });

  it("caso 14: un mes anterior se informa completo y con los saldos a su cierre", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "20000", date: "2026-10-15", accountId: f.cash, categoryId: f.categories.supermercado }, "2026-10-15");
    await record(f.userId, { type: "INCOME", amount: "100000", date: "2026-10-20", accountId: f.bank, categoryId: f.categories.sueldo }, "2026-10-20");
    await record(f.userId, { type: "EXPENSE", amount: "5000", date: "2026-11-02", accountId: f.cash, categoryId: f.categories.supermercado });

    const october = await dashboard(f.userId, "2026-10");
    expect(october).toMatchObject({ isCurrentMonth: false, range: { from: "2026-10-01", to: "2026-10-31" }, projection: null, upcoming: [] });
    expect(october.totals).toMatchObject({ income: "100000.00", expense: "20000.00", savings: "80000.00" });
    expect(october.balances).toMatchObject({ asOf: "2026-10-31", available: "630000.00", netWorth: "630000.00", accumulatedSavings: "80000.00" });
    expect(october.balances.accounts.find((a) => a.name === "Efectivo")?.balance).toBe("30000.00");
    expect(october.navigation).toEqual({ previous: null, next: "2026-11" });
    // Sin datos de septiembre no hay comparación.
    expect(october.comparison).toBeNull();

    const november = await dashboard(f.userId);
    expect(november.balances).toMatchObject({ available: "625000.00", accumulatedSavings: "75000.00" });
    expect(november.navigation).toEqual({ previous: "2026-10", next: null });
  });

  it("un mes anterior al inicio del registro queda vacío; un mes futuro se rechaza", async () => {
    const f = await setupFinance();
    const september = await dashboard(f.userId, "2026-09");
    expect(september).toMatchObject({ beforeTracking: true, comparison: null, categories: [], recent: [] });
    expect(september.totals.expense).toBe("0.00");
    await expect(dashboard(f.userId, "2026-12")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("compara el mes en curso con el anterior a la misma altura", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "10000", date: "2026-10-03", accountId: f.cash, categoryId: f.categories.supermercado }, "2026-10-03");
    // Después del día 4 de octubre: no entra en la comparación con el 4 de noviembre.
    await record(f.userId, { type: "EXPENSE", amount: "90000", date: "2026-10-20", accountId: f.cash, categoryId: f.categories.supermercado }, "2026-10-20");
    await record(f.userId, { type: "EXPENSE", amount: "15000", date: "2026-11-02", accountId: f.cash, categoryId: f.categories.supermercado });

    const report = await dashboard(f.userId);
    expect(report.comparison).toMatchObject({
      range: { from: "2026-10-01", to: "2026-10-04" },
      totals: { expense: "10000.00" },
      change: { expense: { diff: "5000.00", percent: 50 } },
    });
    // La serie del mes anterior es completa (para el gráfico).
    expect(report.dailyExpense[19]?.previous).toBe("100000.00");
  });

  it("proyecta el cierre del mes con el ritmo histórico y los pendientes", async () => {
    const f = await setupFinance();
    // Octubre: 310.000 variables en 31 días → 10.000 por día.
    await record(f.userId, { type: "EXPENSE", amount: "310000", date: "2026-10-31", accountId: f.bank, categoryId: f.categories.supermercado }, "2026-10-31");
    // Noviembre al día 4: 20.000 variables → 5.000 por día. Más un pendiente de 7.000.
    await record(f.userId, { type: "EXPENSE", amount: "20000", date: "2026-11-01", accountId: f.cash, categoryId: f.categories.supermercado });
    await createTransaction(
      f.userId,
      { type: "EXPENSE", amount: "7000", date: "2026-11-04", accountId: f.cash, categoryId: f.categories.otros, clientId: crypto.randomUUID() },
      { source: "VOICE", today: TODAY, status: "PENDING" },
    );

    const report = await dashboard(f.userId);
    // ritmo = (20.000 + 26 · 10.000) / 30 = 9.333,33…; restante = ritmo · 26 = 242.666,67
    expect(report.projection).toEqual({
      expense: "269666.67",
      income: "0.00",
      savings: "-269666.67",
      expectedExpense: "7000.00",
      expectedIncome: "0.00",
    });
    expect(report.pending.count).toBe(1);
    expect(report.totals.expense).toBe("20000.00");
  });

  it("muestra los resúmenes de tarjeta a pagar como próximos vencimientos", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "69500", date: "2026-10-10", accountId: f.card, categoryId: f.categories.farmacia }, "2026-10-10");
    const report = await dashboard(f.userId);
    expect(report.upcoming).toEqual([{ cardId: f.card, name: "Visa", period: "2026-10", dueDate: "2026-11-07", amount: "69500.00", status: "unpaid" }]);
  });
});

describe("identidad de control del patrimonio", () => {
  it("patrimonio = inicial + ahorro acumulado + ajustes, con deuda inicial y cuentas abiertas después", async () => {
    const user = await createTestUser();
    await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: null } });
    await completeOnboarding(
      user.id,
      {
        trackingStartDate: "2026-10-01",
        accounts: [
          { ref: "cash", name: "Efectivo", type: "CASH", openingBalance: "40000" },
          { ref: "bank", name: "Banco", type: "BANK", openingBalance: "600000" },
        ],
        cards: [
          {
            ref: "visa",
            name: "Visa",
            closingDay: 26,
            dueDay: 7,
            paymentAccountRef: "bank",
            openingStatementBalance: "80000",
            openingUnbilledBalance: "15000",
            preexistingPlans: [{ description: "Televisor", installmentAmount: "25000", nextInstallmentNumber: 4, installmentCount: 6 }],
          },
        ],
        voiceAutoSave: false,
      },
      "2026-10-01",
    );
    const accounts = await prisma.account.findMany({ where: { userId: user.id } });
    const id = (name: string) => accounts.find((a) => a.name === name)!.id;
    const cat = (name: string) => categoryId(user.id, name);

    await record(user.id, { type: "INCOME", amount: "900000", date: "2026-10-05", accountId: id("Banco"), categoryId: await cat("Sueldo") }, "2026-10-05");
    await record(user.id, { type: "EXPENSE", amount: "120000", date: "2026-10-08", accountId: id("Visa"), categoryId: await cat("Otros"), installments: 3 }, "2026-10-08");
    await record(user.id, { type: "CARD_PAYMENT", amount: "95000", date: "2026-10-07", accountId: id("Banco"), toAccountId: id("Visa") }, "2026-10-07");
    await record(user.id, { type: "TRANSFER", amount: "50000", date: "2026-10-12", accountId: id("Banco"), toAccountId: id("Efectivo") }, "2026-10-12");
    const deleted = await record(user.id, { type: "EXPENSE", amount: "3000", date: "2026-10-13", accountId: id("Efectivo"), categoryId: await cat("Otros") }, "2026-10-13");
    await deleteTransaction(user.id, deleted.id);
    await adjustBalance(user.id, id("Efectivo"), "88500", "2026-10-20"); // 90.000 → 88.500
    await createAccount(user.id, { name: "Dólares", type: "OTHER", openingBalance: "300000", openingDate: "2026-10-25" }, "2026-10-25");
    await record(user.id, { type: "EXPENSE", amount: "45000", date: "2026-11-02", accountId: id("Efectivo"), categoryId: await cat("Supermercado") });

    for (const asOf of ["2026-10-10", "2026-10-31", TODAY]) {
      const b = await getNetWorthBreakdown(user.id, asOf, "2026-10-01");
      expect(b.netWorth, asOf).toBe(b.initial + b.accumulatedSavings + b.adjustments);
    }
    const today = await getNetWorthBreakdown(user.id, TODAY, "2026-10-01");
    // Inicial: 40.000 + 600.000 + 300.000 (Dólares) − (80.000 + 15.000 + 3 × 25.000).
    expect(today.initial).toBe(pesos(770_000));
    expect(today.accumulatedSavings).toBe(pesos(900_000 - 120_000 - 45_000));
    expect(today.adjustments).toBe(-pesos(1_500));
  });
});
