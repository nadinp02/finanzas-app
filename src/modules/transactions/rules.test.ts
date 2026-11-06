import { describe, expect, it } from "vitest";
import { balancesFromAggregates, effectsOf, isFlow, validateAccountsForType, type FlowAggregate } from "./rules";

const bank = { type: "BANK" as const, isActive: true };
const cash = { type: "CASH" as const, isActive: true };
const card = { type: "CREDIT_CARD" as const, isActive: true };

describe("efectos de cada tipo de movimiento", () => {
  it("ingreso suma y gasto resta en la cuenta", () => {
    expect(effectsOf({ type: "INCOME", amount: 1000n, accountId: "a", toAccountId: null })).toEqual([{ accountId: "a", delta: 1000n }]);
    expect(effectsOf({ type: "EXPENSE", amount: 1000n, accountId: "a", toAccountId: null })).toEqual([{ accountId: "a", delta: -1000n }]);
  });

  it("transferencia y pago de tarjeta mueven el importe entre cuentas", () => {
    expect(effectsOf({ type: "TRANSFER", amount: 500n, accountId: "a", toAccountId: "b" })).toEqual([
      { accountId: "a", delta: -500n },
      { accountId: "b", delta: 500n },
    ]);
    expect(effectsOf({ type: "CARD_PAYMENT", amount: 500n, accountId: "a", toAccountId: "card" })).toEqual([
      { accountId: "a", delta: -500n },
      { accountId: "card", delta: 500n },
    ]);
  });

  it("el ajuste aplica su signo", () => {
    expect(effectsOf({ type: "ADJUSTMENT", amount: -300n, accountId: "a", toAccountId: null })).toEqual([{ accountId: "a", delta: -300n }]);
  });

  it("solo ingresos y gastos son flujo", () => {
    expect(["INCOME", "EXPENSE", "TRANSFER", "CARD_PAYMENT", "ADJUSTMENT"].filter((type) => isFlow(type as never))).toEqual([
      "INCOME",
      "EXPENSE",
    ]);
  });
});

describe("saldos desde agregados", () => {
  it("ejemplo crítico: la compra con tarjeta no toca el banco y el pago no es gasto", () => {
    const openings = new Map([
      ["bank", 50_000_000n],
      ["card", 0n],
    ]);
    const afterPurchase: FlowAggregate[] = [{ accountId: "card", type: "EXPENSE", role: "primary", total: 6_950_000n }];
    const purchase = balancesFromAggregates(openings, afterPurchase);
    expect(purchase.get("bank")).toBe(50_000_000n);
    expect(purchase.get("card")).toBe(-6_950_000n);

    const afterPayment = balancesFromAggregates(openings, [
      ...afterPurchase,
      { accountId: "bank", type: "CARD_PAYMENT", role: "primary", total: 6_950_000n },
      { accountId: "card", type: "CARD_PAYMENT", role: "counterpart", total: 6_950_000n },
    ]);
    expect(afterPayment.get("bank")).toBe(43_050_000n);
    expect(afterPayment.get("card")).toBe(0n);
  });

  it("ignora cuentas que no se pidieron", () => {
    const balances = balancesFromAggregates(new Map([["a", 0n]]), [{ accountId: "z", type: "INCOME", role: "primary", total: 5n }]);
    expect([...balances.keys()]).toEqual(["a"]);
  });
});

describe("cuentas válidas por tipo", () => {
  const strict = { requireActive: true };

  it("acepta las combinaciones correctas", () => {
    expect(validateAccountsForType("INCOME", bank, null, strict)).toBeNull();
    expect(validateAccountsForType("EXPENSE", card, null, { ...strict, installments: 3 })).toBeNull();
    expect(validateAccountsForType("TRANSFER", bank, cash, strict)).toBeNull();
    expect(validateAccountsForType("CARD_PAYMENT", bank, card, strict)).toBeNull();
    expect(validateAccountsForType("ADJUSTMENT", card, null, strict)).toBeNull();
  });

  it("rechaza combinaciones que distorsionan saldos o informes", () => {
    expect(validateAccountsForType("INCOME", card, null, strict)).toHaveProperty("accountId");
    expect(validateAccountsForType("EXPENSE", bank, null, { ...strict, installments: 3 })).toHaveProperty("installments");
    expect(validateAccountsForType("TRANSFER", bank, card, strict)).toHaveProperty("toAccountId");
    expect(validateAccountsForType("CARD_PAYMENT", bank, cash, strict)).toHaveProperty("toAccountId");
    expect(validateAccountsForType("CARD_PAYMENT", card, card, strict)).toHaveProperty("accountId");
  });

  it("exige cuentas activas solo al crear", () => {
    const inactive = { type: "BANK" as const, isActive: false };
    expect(validateAccountsForType("EXPENSE", inactive, null, strict)).toHaveProperty("accountId");
    expect(validateAccountsForType("EXPENSE", inactive, null, { requireActive: false })).toBeNull();
  });
});
