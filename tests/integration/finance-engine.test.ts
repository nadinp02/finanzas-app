import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { adjustBalance, createAccount, deleteAccount, getBalances, netWorthOf } from "@/modules/accounts/service";
import { getCardStatus } from "@/modules/cards/service";
import { deleteCategory } from "@/modules/categories/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { getBootstrap } from "@/modules/settings/service";
import { createTransaction, deleteTransaction, updateTransaction } from "@/modules/transactions/service";
import { createTestUser } from "../support/factories";
import { balance, expensesBetween, pesos, record, setupFinance, TODAY } from "../support/finance";

describe("movimientos y saldos", () => {
  it("caso 1: gasto en efectivo", async () => {
    const f = await setupFinance();
    const tx = await record(f.userId, { type: "EXPENSE", amount: "12500", date: "2026-11-02", accountId: f.cash, categoryId: f.categories.supermercado });
    expect(tx).toMatchObject({ amount: "12500.00", paymentMethod: "CASH", description: "Supermercado", isFixed: false, status: "CONFIRMED" });
    expect(await balance(f.userId, f.cash)).toBe(pesos(37_500));
    expect(await balance(f.userId, f.bank)).toBe(pesos(500_000));
  });

  it("caso 2: ingreso", async () => {
    const f = await setupFinance();
    const tx = await record(f.userId, { type: "INCOME", amount: "850000", date: "2026-11-01", accountId: f.bank, categoryId: f.categories.sueldo });
    expect(tx).toMatchObject({ paymentMethod: "BANK_TRANSFER", isFixed: true });
    expect(await balance(f.userId, f.bank)).toBe(pesos(1_350_000));
  });

  it("caso 3: transferencia entre cuentas propias no cambia el total disponible", async () => {
    const f = await setupFinance();
    const before = netWorthOf(await getBalances(f.userId, TODAY));
    const tx = await record(f.userId, { type: "TRANSFER", amount: "20000", date: "2026-11-03", accountId: f.bank, toAccountId: f.cash });
    expect(tx).toMatchObject({ description: "Transferencia a Efectivo", category: null });
    expect(await balance(f.userId, f.bank)).toBe(pesos(480_000));
    expect(await balance(f.userId, f.cash)).toBe(pesos(70_000));
    expect(netWorthOf(await getBalances(f.userId, TODAY))).toEqual(before);
    expect(await expensesBetween(f.userId, "2026-11-01", "2026-11-30")).toBe(0n);
  });

  it("casos 4 y 5: compra con tarjeta y pago del resumen (ejemplo crítico)", async () => {
    const f = await setupFinance();
    const purchase = await record(f.userId, {
      type: "EXPENSE",
      amount: "69500",
      date: "2026-10-10",
      accountId: f.card,
      categoryId: f.categories.farmacia,
      merchantName: "farmacity",
    });
    expect(purchase).toMatchObject({ paymentMethod: "CREDIT_CARD", merchant: { name: "Farmacity" }, description: "Farmacity" });
    expect(await balance(f.userId, f.bank)).toBe(pesos(500_000));
    expect(await balance(f.userId, f.card)).toBe(-pesos(69_500));
    expect(await expensesBetween(f.userId, "2026-10-01", "2026-10-31")).toBe(pesos(69_500));

    const beforePayment = await getCardStatus(f.userId, f.card, TODAY);
    expect(beforePayment.lastStatement).toMatchObject({ period: "2026-10", balance: "69500.00", remaining: "69500.00", dueDate: "2026-11-07" });

    const payment = await record(f.userId, { type: "CARD_PAYMENT", amount: "69500", date: "2026-11-04", accountId: f.bank, toAccountId: f.card });
    expect(payment).toMatchObject({ category: null, description: "Pago de Visa" });
    expect(await balance(f.userId, f.bank)).toBe(pesos(430_500));
    expect(await balance(f.userId, f.card)).toBe(0n);
    expect(await expensesBetween(f.userId, "2026-10-01", "2026-11-30")).toBe(pesos(69_500));

    const status = await getCardStatus(f.userId, f.card, TODAY);
    expect(status).toMatchObject({ totalDebt: "0.00" });
    expect(status.lastStatement).toMatchObject({ remaining: "0.00", status: "paid" });
  });

  it("caso 6: pago parcial del resumen", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "100000", date: "2026-10-12", accountId: f.card, categoryId: f.categories.supermercado });
    await record(f.userId, { type: "CARD_PAYMENT", amount: "40000", date: "2026-11-03", accountId: f.bank, toAccountId: f.card });
    const status = await getCardStatus(f.userId, f.card, TODAY);
    expect(status.lastStatement).toMatchObject({ balance: "100000.00", paid: "40000.00", remaining: "60000.00", status: "partial" });
    expect(status.totalDebt).toBe("60000.00");
    expect(await balance(f.userId, f.bank)).toBe(pesos(460_000));
    // Pasado el vencimiento sin completar el pago, el resumen figura vencido.
    expect((await getCardStatus(f.userId, f.card, "2026-11-10")).lastStatement?.status).toBe("overdue");
  });

  it("caso 7: compra en cuotas reconoce el gasto total y factura una cuota por resumen", async () => {
    const f = await setupFinance();
    const tx = await record(f.userId, {
      type: "EXPENSE",
      amount: "120000",
      date: "2026-11-02",
      accountId: f.card,
      categoryId: f.categories.otros,
      installments: 3,
      description: "Heladera",
    });
    expect(tx.installments).toEqual({ count: 3, amountEach: "40000.00" });
    expect(await expensesBetween(f.userId, "2026-11-01", "2026-11-30")).toBe(pesos(120_000));
    expect(await balance(f.userId, f.card)).toBe(-pesos(120_000));

    const status = await getCardStatus(f.userId, f.card, TODAY);
    expect(status.currentPeriod).toMatchObject({ period: "2026-11", charges: "40000.00" });
    expect(status.futureInstallments).toBe("80000.00");
    expect(status.totalDebt).toBe("120000.00");
    expect(status.plans).toEqual([
      expect.objectContaining({ description: "Heladera", installmentCount: 3, billedCount: 1, remainingAmount: "80000.00", nextPeriod: "2026-12" }),
    ]);
  });

  it("caso 8: editar un movimiento recalcula saldos y controla versiones", async () => {
    const f = await setupFinance();
    const tx = await record(f.userId, { type: "EXPENSE", amount: "10000", date: "2026-11-02", accountId: f.cash, categoryId: f.categories.supermercado });
    const updated = await updateTransaction(
      f.userId,
      tx.id,
      tx.version,
      { type: "EXPENSE", amount: "15000", date: "2026-11-02", accountId: f.bank, categoryId: f.categories.supermercado },
      TODAY,
    );
    expect(updated).toMatchObject({ amount: "15000.00", version: 2, paymentMethod: "DEBIT_CARD" });
    expect(await balance(f.userId, f.cash)).toBe(pesos(50_000));
    expect(await balance(f.userId, f.bank)).toBe(pesos(485_000));

    await expect(
      updateTransaction(f.userId, tx.id, 1, { type: "EXPENSE", amount: "1", date: "2026-11-02", accountId: f.bank, categoryId: f.categories.supermercado }, TODAY),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { current: expect.objectContaining({ version: 2 }) } });

    // Pasar una compra en un pago a 6 cuotas rehace el plan.
    const purchase = await record(f.userId, { type: "EXPENSE", amount: "60000", date: "2026-11-02", accountId: f.card, categoryId: f.categories.otros });
    const inInstallments = await updateTransaction(
      f.userId,
      purchase.id,
      purchase.version,
      { type: "EXPENSE", amount: "60000", date: "2026-11-02", accountId: f.card, categoryId: f.categories.otros, installments: 6 },
      TODAY,
    );
    expect(inInstallments.installments).toEqual({ count: 6, amountEach: "10000.00" });
    expect((await getCardStatus(f.userId, f.card, TODAY)).futureInstallments).toBe("50000.00");
  });

  it("caso 9: eliminar un movimiento restaura saldos y borra sus cuotas", async () => {
    const f = await setupFinance();
    const expense = await record(f.userId, { type: "EXPENSE", amount: "5000", date: "2026-11-02", accountId: f.cash, categoryId: f.categories.supermercado });
    const purchase = await record(f.userId, { type: "EXPENSE", amount: "90000", date: "2026-11-02", accountId: f.card, categoryId: f.categories.otros, installments: 3 });
    await deleteTransaction(f.userId, expense.id, expense.version);
    await deleteTransaction(f.userId, purchase.id);
    expect(await balance(f.userId, f.cash)).toBe(pesos(50_000));
    expect(await balance(f.userId, f.card)).toBe(0n);
    expect(await prisma.installmentPlan.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { userId: f.userId, action: "DELETE", entityType: "Transaction" } })).toBe(2);
  });

  it("caso 16: saldos a una fecha consideran solo lo ocurrido hasta ese día", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "INCOME", amount: "300000", date: "2026-10-05", accountId: f.bank, categoryId: f.categories.sueldo });
    await record(f.userId, { type: "EXPENSE", amount: "45000", date: "2026-10-20", accountId: f.bank, categoryId: f.categories.supermercado });
    await record(f.userId, { type: "TRANSFER", amount: "10000", date: "2026-11-01", accountId: f.bank, toAccountId: f.cash });
    await record(f.userId, { type: "EXPENSE", amount: "30000", date: "2026-11-02", accountId: f.card, categoryId: f.categories.supermercado });

    expect(await balance(f.userId, f.bank, "2026-10-04")).toBe(pesos(500_000));
    expect(await balance(f.userId, f.bank, "2026-10-31")).toBe(pesos(755_000));
    expect(await balance(f.userId, f.bank)).toBe(pesos(745_000));
    expect(await balance(f.userId, f.cash)).toBe(pesos(60_000));
    expect(netWorthOf(await getBalances(f.userId, TODAY))).toEqual({
      available: pesos(805_000),
      cardDebt: pesos(30_000),
      netWorth: pesos(775_000),
    });
    // Una cuenta abierta después de la fecha consultada no existía.
    expect((await getBalances(f.userId, "2026-09-30")).length).toBe(0);
  });

  it("los movimientos pendientes no afectan saldos", async () => {
    const f = await setupFinance();
    await createTransaction(
      f.userId,
      { type: "EXPENSE", amount: "9999", date: "2026-11-01", accountId: f.bank, categoryId: f.categories.otros, clientId: randomUUID() },
      { source: "RECURRING", status: "PENDING", today: TODAY },
    );
    expect(await balance(f.userId, f.bank)).toBe(pesos(500_000));
  });
});

describe("validaciones de integridad", () => {
  it("rechaza fechas futuras y anteriores a la apertura de la cuenta", async () => {
    const f = await setupFinance();
    const base = { type: "EXPENSE" as const, amount: "100", accountId: f.cash, categoryId: f.categories.otros };
    await expect(record(f.userId, { ...base, date: "2026-11-05" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { date: expect.any(String) } });
    await expect(record(f.userId, { ...base, date: "2026-09-30" })).rejects.toMatchObject({ fields: { date: expect.stringContaining("Efectivo") } });
  });

  it("rechaza combinaciones de cuentas y categorías inválidas", async () => {
    const f = await setupFinance();
    await expect(record(f.userId, { type: "INCOME", amount: "1", date: TODAY, accountId: f.card, categoryId: f.categories.sueldo })).rejects.toMatchObject({
      fields: { accountId: expect.any(String) },
    });
    await expect(record(f.userId, { type: "EXPENSE", amount: "1", date: TODAY, accountId: f.cash, categoryId: f.categories.sueldo })).rejects.toMatchObject({
      fields: { categoryId: "Elegí una categoría de gastos." },
    });
    await expect(record(f.userId, { type: "TRANSFER", amount: "1", date: TODAY, accountId: f.bank, toAccountId: f.card })).rejects.toMatchObject({
      fields: { toAccountId: expect.any(String) },
    });
    await expect(
      record(f.userId, { type: "EXPENSE", amount: "1", date: TODAY, accountId: f.bank, categoryId: f.categories.otros, installments: 3 }),
    ).rejects.toMatchObject({ fields: { installments: expect.any(String) } });
  });

  it("no permite usar cuentas de otra usuaria", async () => {
    const f = await setupFinance();
    const other = await createTestUser();
    await expect(record(other.id, { type: "EXPENSE", amount: "1", date: TODAY, accountId: f.cash, categoryId: f.categories.otros })).rejects.toMatchObject({
      fields: { accountId: expect.any(String) },
    });
  });

  it("la base de datos rechaza un pago de tarjeta sin destino aunque se saltee el servicio", async () => {
    const f = await setupFinance();
    await expect(
      prisma.transaction.create({
        data: { userId: f.userId, type: "CARD_PAYMENT", amount: "100", date: new Date(), description: "x", accountId: f.bank },
      }),
    ).rejects.toThrow(/transactions_to_account_check/);
  });

  it("el alta es idempotente por clientId", async () => {
    const f = await setupFinance();
    const input = { type: "EXPENSE" as const, amount: "777", date: TODAY, accountId: f.cash, categoryId: f.categories.otros, clientId: randomUUID() };
    const first = await createTransaction(f.userId, input, { source: "MANUAL", today: TODAY });
    const second = await createTransaction(f.userId, input, { source: "MANUAL", today: TODAY });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(await prisma.transaction.count({ where: { userId: f.userId } })).toBe(1);
  });

  it("las cuentas nuevas van al final y las tarjetas después de las cuentas", async () => {
    const f = await setupFinance();
    await createAccount(f.userId, { name: "Mercado Pago", type: "DIGITAL_WALLET", openingBalance: "0", openingDate: TODAY }, TODAY);
    const { accounts } = await getBootstrap(f.userId);
    expect(accounts.map((a) => a.name)).toEqual(["Efectivo", "Banco", "Mercado Pago", "Visa"]);
  });

  it("una cuenta con movimientos no se borra", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "1", date: TODAY, accountId: f.cash, categoryId: f.categories.otros });
    await expect(deleteAccount(f.userId, f.cash)).rejects.toMatchObject({ code: "ACCOUNT_IN_USE" });
  });
});

describe("ajustes, comercios y categorías", () => {
  it("el ajuste de saldo registra la diferencia sin tocar ingresos ni gastos", async () => {
    const f = await setupFinance();
    const result = await adjustBalance(f.userId, f.bank, "480000", TODAY);
    expect(result?.difference).toBe("-20000.00");
    expect(await balance(f.userId, f.bank)).toBe(pesos(480_000));
    expect(await adjustBalance(f.userId, f.bank, "480000", TODAY)).toBeNull();
    expect(await expensesBetween(f.userId, "2026-11-01", "2026-11-30")).toBe(0n);

    await adjustBalance(f.userId, f.card, "15000", TODAY);
    expect((await getCardStatus(f.userId, f.card, TODAY)).totalDebt).toBe("15000.00");
  });

  it("aprende la categoría habitual de un comercio", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "1000", date: TODAY, accountId: f.cash, categoryId: f.categories.salud, merchantName: "Farmacíty" });
    const merchant = await prisma.merchant.findFirstOrThrow({ where: { userId: f.userId, normalizedName: "farmacity" } });
    expect(merchant).toMatchObject({ usageCount: 1, defaultCategoryId: f.categories.salud });
    await record(f.userId, { type: "EXPENSE", amount: "1000", date: TODAY, accountId: f.cash, categoryId: f.categories.otros, merchantName: "Kiosco Pepe" });
    expect(await prisma.merchant.findFirst({ where: { userId: f.userId, normalizedName: "kiosco pepe" } })).not.toBeNull();
  });

  it("borrar una categoría usada exige reasignar sus movimientos", async () => {
    const f = await setupFinance();
    await record(f.userId, { type: "EXPENSE", amount: "1000", date: TODAY, accountId: f.cash, categoryId: f.categories.farmacia });
    await expect(deleteCategory(f.userId, f.categories.farmacia)).rejects.toMatchObject({ code: "CATEGORY_IN_USE" });
    await expect(deleteCategory(f.userId, f.categories.salud)).rejects.toMatchObject({ code: "CATEGORY_HAS_CHILDREN" });
    await expect(deleteCategory(f.userId, f.categories.farmacia, f.categories.sueldo)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await deleteCategory(f.userId, f.categories.farmacia, f.categories.salud)).toEqual({ reassigned: 1 });
    expect(await prisma.transaction.count({ where: { categoryId: f.categories.salud } })).toBe(1);
  });
});

describe("configuración inicial", () => {
  it("registra saldos y deudas iniciales a la fecha de inicio", async () => {
    const user = await prisma.user.create({ data: { email: "nueva@example.com", name: "Nueva", passwordHash: "x" } });
    await completeOnboarding(
      user.id,
      {
        trackingStartDate: "2026-11-04",
        accounts: [
          { ref: "cash", name: "Efectivo", type: "CASH", openingBalance: "35000" },
          { ref: "mp", name: "Mercado Pago", type: "DIGITAL_WALLET", openingBalance: "120000" },
          { ref: "bank", name: "Banco Nación", type: "SAVINGS", openingBalance: "800000" },
        ],
        cards: [
          {
            ref: "visa",
            name: "Visa Nación",
            closingDay: 26,
            dueDay: 7,
            paymentAccountRef: "bank",
            openingStatementBalance: "300000",
            openingUnbilledBalance: "80000",
            preexistingPlans: [{ description: "Televisor", installmentAmount: "50000", nextInstallmentNumber: 10, installmentCount: 12 }],
          },
        ],
        defaultAccountRef: "mp",
        voiceAutoSave: true,
      },
      TODAY,
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { defaultAccount: true } });
    expect(updated.onboardedAt).not.toBeNull();
    expect(updated.defaultAccount?.name).toBe("Mercado Pago");

    const worth = netWorthOf(await getBalances(user.id, TODAY));
    // Deuda: 300.000 + 80.000 + 3 cuotas de 50.000 (10, 11 y 12 de 12).
    expect(worth).toEqual({ available: pesos(955_000), cardDebt: pesos(530_000), netWorth: pesos(425_000) });

    const card = await prisma.account.findFirstOrThrow({ where: { userId: user.id, type: "CREDIT_CARD" } });
    const status = await getCardStatus(user.id, card.id, TODAY);
    expect(status.lastStatement).toMatchObject({ period: "2026-10", remaining: "300000.00" });
    expect(status.currentPeriod.charges).toBe("130000.00");
    expect(status.futureInstallments).toBe("100000.00");
    expect(status.plans[0]).toMatchObject({ description: "Televisor", billedCount: 10, remainingAmount: "100000.00" });

    // La deuda inicial no es gasto del período.
    expect(await expensesBetween(user.id, "2026-11-01", "2026-11-30")).toBe(0n);
    await expect(completeOnboarding(user.id, { trackingStartDate: TODAY, accounts: [{ ref: "a", name: "A", type: "CASH", openingBalance: "0" }], cards: [], voiceAutoSave: false }, TODAY)).rejects.toMatchObject({
      code: "ALREADY_ONBOARDED",
    });
  });
});
