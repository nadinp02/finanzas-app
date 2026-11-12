import { describe, expect, it } from "vitest";
import { interpretLocally } from "./interpret-local";
import {
  canAutoSave,
  detectFlowHints,
  locateQuote,
  resolveAccount,
  scanAccountMentions,
  scanMerchants,
  validateInterpretation,
  type VoiceContext,
} from "./rules";
import type { InterpretedItem } from "./schema";
import { categoryIdByPath, TEST_ACCOUNTS, TEST_MERCHANTS, testContext } from "./test-context";

const TODAY = "2026-11-05";
let keyCounter = 0;
const newKey = () => `10000000-0000-4000-8000-${String(++keyCounter).padStart(12, "0")}`;

function item(overrides: Partial<InterpretedItem>): InterpretedItem {
  return {
    type: "EXPENSE",
    amount: "0",
    date: TODAY,
    description: null,
    merchant: null,
    category: null,
    accountMention: null,
    installments: null,
    quote: "",
    confidence: 0.95,
    ...overrides,
  };
}

function validate(transcript: string, items: Partial<InterpretedItem>[], ctx: VoiceContext = testContext(), local = false) {
  return validateInterpretation(transcript, items.map(item), ctx, { local, newKey });
}

const codes = (draft: { issues: { code: string }[] }) => draft.issues.map((i) => i.code);

describe("validación determinística: lo claro pasa", () => {
  it("caso 17 interpretado por un modelo: dos movimientos sin dudas se pueden guardar solos", () => {
    const transcript = "Nafta cincuenta mil, supermercado treinta y dos mil";
    const { drafts, notices } = validate(transcript, [
      { amount: "50000.00", description: "Nafta", category: "Transporte › Combustible", quote: "Nafta cincuenta mil" },
      { amount: "32000.00", description: "Supermercado", category: "Supermercado", quote: "supermercado treinta y dos mil" },
    ]);
    expect(notices).toEqual([]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      amount: "50000.00",
      date: TODAY,
      categoryId: categoryIdByPath("Transporte › Combustible"),
      accountId: TEST_ACCOUNTS.cash.id,
      issues: [],
    });
    expect(drafts[0]!.notes).toContain("No dijiste con qué pagaste: queda Efectivo, tu cuenta habitual.");
    expect(drafts[1]).toMatchObject({ amount: "32000.00", categoryId: categoryIdByPath("Supermercado"), issues: [] });
    expect(drafts[0]!.key).not.toBe(drafts[1]!.key);
    expect(canAutoSave(drafts, notices)).toBe(true);
  });

  it("ingreso con verbo, fecha relativa y cuenta mencionada", () => {
    const transcript = "Ayer me ingresaron un pago de ciento cincuenta mil en el Galicia";
    const { drafts } = validate(transcript, [
      { type: "INCOME", amount: "150000", date: "2026-11-04", category: "Trabajo independiente", accountMention: "en el Galicia", quote: transcript },
    ]);
    expect(drafts[0]).toMatchObject({ type: "INCOME", amount: "150000.00", date: "2026-11-04", accountId: TEST_ACCOUNTS.bank.id, issues: [] });
  });

  it("comercio conocido por variante: usa el nombre real y su categoría habitual", () => {
    const transcript = "farmaciti sesenta y nueve mil quinientos con la visa";
    const { drafts } = validate(transcript, [{ amount: "69500", merchant: "farmaciti", quote: transcript }]);
    expect(drafts[0]).toMatchObject({
      merchantName: "Farmacity",
      categoryId: categoryIdByPath("Salud › Farmacia"),
      accountId: TEST_ACCOUNTS.visa.id,
      issues: [],
    });
  });

  it("cuotas dichas con tarjeta", () => {
    const transcript = "compré una tele de 300 mil en 6 cuotas con la visa";
    const { drafts } = validate(transcript, [
      { amount: "300000", installments: 6, category: "Compras › Tecnología", accountMention: "con la visa", quote: transcript },
    ]);
    expect(drafts[0]).toMatchObject({ installments: 6, accountId: TEST_ACCOUNTS.visa.id, issues: [] });
  });
});

describe("validación determinística: nada se inventa", () => {
  it("importe que no se dijo: queda vacío", () => {
    const { drafts } = validate("nafta cincuenta mil", [{ amount: "55000", category: "Transporte › Combustible", quote: "nafta cincuenta mil" }]);
    expect(drafts[0]!.amount).toBeNull();
    expect(codes(drafts[0]!)).toContain("NOT_SAID");
  });

  it("el mismo importe no puede usarse dos veces si se dijo una", () => {
    const transcript = "nafta cincuenta mil";
    const { drafts } = validate(transcript, [
      { amount: "50000", quote: transcript, category: "Transporte › Combustible" },
      { amount: "50000", quote: transcript, category: "Transporte › Combustible" },
    ]);
    expect(codes(drafts[1]!)).toContain("REPEATED");
  });

  it("fecha que no se dijo: se marca y vuelve a la dicha (o a hoy)", () => {
    const { drafts } = validate("super 20 mil", [{ amount: "20000", date: "2026-11-01", category: "Supermercado", quote: "super 20 mil" }]);
    expect(drafts[0]).toMatchObject({ date: TODAY });
    expect(codes(drafts[0]!)).toContain("NOT_SAID");
  });

  it("fecha vaga: pide el día", () => {
    const transcript = "la semana pasada gasté 15 mil en el super";
    const { drafts } = validate(transcript, [{ amount: "15000", category: "Supermercado", quote: transcript }]);
    expect(drafts[0]!.issues).toContainEqual(expect.objectContaining({ field: "date", code: "VAGUE", message: "Dijiste «la semana pasada»: elegí el día exacto." }));
    expect(canAutoSave(drafts, [])).toBe(false);
  });

  it("dijo una fecha pero el modelo dejó hoy", () => {
    const transcript = "ayer super 20 mil";
    const { drafts } = validate(transcript, [{ amount: "20000", category: "Supermercado", quote: transcript }]);
    expect(codes(drafts[0]!)).toContain("OTHER_DATE");
  });

  it("fechas futuras o de más de 60 días", () => {
    const future = validate("super 20 mil", [{ amount: "20000", date: "2026-11-20", category: "Supermercado", quote: "super 20 mil" }]);
    expect(codes(future.drafts[0]!)).toContain("FUTURE");
    const old = validate("el 15 de agosto super 20 mil", [{ amount: "20000", date: "2026-08-15", category: "Supermercado", quote: "el 15 de agosto super 20 mil" }], testContext({ trackingStartDate: "2026-01-01" }));
    expect(codes(old.drafts[0]!)).toContain("TOO_OLD");
  });

  it("comercio que no se dijo: se quita", () => {
    const { drafts } = validate("super 20 mil", [{ amount: "20000", merchant: "Coto", category: "Supermercado", quote: "super 20 mil" }]);
    expect(drafts[0]!.merchantName).toBeNull();
    expect(drafts[0]!.notes).toContain("Quitamos «Coto»: no lo mencionaste.");
  });

  it("una palabra de categoría no es un comercio", () => {
    const { drafts } = validate("supermercado 20 mil", [{ amount: "20000", merchant: "Supermercado", category: "Supermercado", quote: "supermercado 20 mil" }]);
    expect(drafts[0]).toMatchObject({ merchantName: null, description: "Supermercado" });
  });

  it("medio de pago que no se dijo: se ignora y queda la cuenta habitual", () => {
    const { drafts } = validate("super 20 mil", [{ amount: "20000", accountMention: "con la visa", category: "Supermercado", quote: "super 20 mil" }]);
    expect(drafts[0]!.accountId).toBe(TEST_ACCOUNTS.cash.id);
    expect(drafts[0]!.notes).toContain("Quitamos «con la visa»: no lo mencionaste.");
  });

  it("sin mención y sin cuenta habitual: la cuenta queda sin elegir", () => {
    const { drafts } = validate("super 20 mil", [{ amount: "20000", category: "Supermercado", quote: "super 20 mil" }], testContext({ defaultAccountId: null }));
    expect(drafts[0]!.accountId).toBeNull();
    expect(codes(drafts[0]!)).toContain("MISSING");
  });

  it("cuotas que no se dijeron o sin tarjeta", () => {
    const notSaid = validate("tele 300 mil con la visa", [{ amount: "300000", installments: 12, category: "Compras", quote: "tele 300 mil con la visa" }]);
    expect(notSaid.drafts[0]!.installments).toBeNull();
    expect(codes(notSaid.drafts[0]!)).toContain("NOT_SAID");
    const cash = validate("tele 300 mil en 3 cuotas en efectivo", [{ amount: "300000", installments: 3, category: "Compras", quote: "tele 300 mil en 3 cuotas en efectivo" }]);
    expect(codes(cash.drafts[0]!)).toContain("NEEDS_CARD");
  });

  it("una cita que no sale de la transcripción", () => {
    const transcript = "nafta 50 mil, super 30 mil";
    const { drafts } = validate(transcript, [
      { amount: "50000", quote: "nafta 50 mil", category: "Transporte › Combustible" },
      { amount: "30000", quote: "verdulería 30 mil", category: "Supermercado" },
    ]);
    expect(codes(drafts[1]!)).toContain("QUOTE_NOT_FOUND");
  });
});

describe("validación determinística: ambigüedades piden confirmación", () => {
  it("«con tarjeta» con dos tarjetas", () => {
    const ctx = testContext({ accounts: [...Object.values(TEST_ACCOUNTS), { id: "00000000-0000-4000-8000-000000009999", name: "Mastercard", type: "CREDIT_CARD" }] });
    const transcript = "ropa 40 mil con tarjeta";
    const { drafts } = validate(transcript, [{ amount: "40000", category: "Compras › Ropa", quote: transcript }], ctx);
    expect(drafts[0]!.accountId).toBeNull();
    expect(drafts[0]!.issues).toContainEqual(expect.objectContaining({ field: "account", code: "AMBIGUOUS" }));
  });

  it("una cuenta que no existe", () => {
    const transcript = "ropa 40 mil con la naranja";
    const { drafts } = validate(transcript, [{ amount: "40000", accountMention: "con la naranja", category: "Compras › Ropa", quote: transcript }]);
    expect(drafts[0]!.issues).toContainEqual(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("cuenta mencionada para todos: se preselecciona y se pide confirmar", () => {
    const transcript = "con la visa: nafta 50 mil y super 30 mil";
    const { drafts } = validate(transcript, [
      { amount: "50000", quote: "nafta 50 mil", category: "Transporte › Combustible" },
      { amount: "30000", quote: "super 30 mil", category: "Supermercado" },
    ]);
    for (const draft of drafts) {
      expect(draft.accountId).toBe(TEST_ACCOUNTS.visa.id);
      expect(codes(draft)).toContain("SHARED_MENTION");
    }
  });

  it("tipo contradictorio con lo dicho", () => {
    const looksIncome = validate("me pagaron 100 mil", [{ amount: "100000", category: "Otros", quote: "me pagaron 100 mil" }]);
    expect(codes(looksIncome.drafts[0]!)).toContain("LOOKS_INCOME");
    const unclear = validate("100 mil", [{ type: "INCOME", amount: "100000", category: "Sueldo", quote: "100 mil" }]);
    expect(codes(unclear.drafts[0]!)).toContain("UNCLEAR_INCOME");
    // "me cobraron" es un gasto.
    const charged = validate("me cobraron 5 mil de comisión", [{ amount: "5000", category: "Otros", quote: "me cobraron 5 mil de comisión" }]);
    expect(codes(charged.drafts[0]!)).not.toContain("LOOKS_INCOME");
  });

  it("baja confianza o intérprete local", () => {
    const low = validate("super 20 mil", [{ amount: "20000", category: "Supermercado", quote: "super 20 mil", confidence: 0.6 }]);
    expect(codes(low.drafts[0]!)).toContain("LOW");
    const local = validate("super 20 mil", [{ amount: "20000", category: "Supermercado", quote: "super 20 mil" }], testContext(), true);
    expect(codes(local.drafts[0]!)).toContain("LOCAL");
    expect(canAutoSave(local.drafts, local.notices)).toBe(false);
  });

  it("importes dichos que no se cargaron y movimientos no soportados", () => {
    const transcript = "nafta 50 mil, super 30 mil y pagué la tarjeta 100 mil";
    const { notices } = validate(transcript, [{ amount: "50000", quote: "nafta 50 mil", category: "Transporte › Combustible" }]);
    expect(notices).toContain("Mencionaste $ 30.000 y no se cargó como movimiento.");
    expect(notices).toContain("Los pagos de tarjeta y las transferencias entre tus cuentas se cargan desde «Nuevo movimiento».");
    // "me quedan 20 mil" no es un movimiento.
    expect(validate("super 30 mil y me quedan 20 mil", [{ amount: "30000", quote: "super 30 mil", category: "Supermercado" }]).notices).toEqual([]);
  });
});

describe("piezas de la validación", () => {
  it("ubica citas sin importar mayúsculas, acentos ni puntuación", () => {
    expect(locateQuote("Nafta $50.000, súper $32.000.", "super $32.000")).toEqual({ start: 15, end: 28 });
    expect(locateQuote("nafta 50 mil", "nafta 60 mil")).toBeNull();
  });

  it("verbos de ingreso y gasto", () => {
    expect(detectFlowHints("cobré el sueldo")).toEqual({ income: true, expense: false });
    expect(detectFlowHints("me cobró la luz")).toEqual({ income: false, expense: true });
  });

  it("cuentas por nombre propio o medio de pago", () => {
    const accounts = Object.values(TEST_ACCOUNTS);
    expect(resolveAccount(scanAccountMentions("pagué con débito", accounts))).toMatchObject({ status: "matched", accountId: TEST_ACCOUNTS.bank.id });
    expect(resolveAccount(scanAccountMentions("con mercado pago", accounts))).toMatchObject({ status: "matched", accountId: TEST_ACCOUNTS.wallet.id });
    expect(resolveAccount(scanAccountMentions("en efectivo", accounts))).toMatchObject({ status: "matched", accountId: TEST_ACCOUNTS.cash.id });
    expect(resolveAccount(scanAccountMentions("con la tarjeta visa", accounts))).toMatchObject({ status: "matched", accountId: TEST_ACCOUNTS.visa.id });
    expect(resolveAccount(scanAccountMentions("nafta 50 mil", accounts))).toEqual({ status: "none" });
  });

  it("comercios con nombre de palabra común necesitan una preposición", () => {
    expect(scanMerchants("claro, gasté 5 mil", TEST_MERCHANTS)).toEqual([]);
    expect(scanMerchants("pagué Claro 15 mil", TEST_MERCHANTS).map((m) => m.merchant.name)).toEqual(["Claro"]);
    expect(scanMerchants("en Coto 20 mil", TEST_MERCHANTS).map((m) => m.merchant.name)).toEqual(["Coto"]);
  });
});

describe("intérprete local", () => {
  const ctx = testContext();

  it("caso 17: un movimiento por importe, con categoría por palabra clave", () => {
    const items = interpretLocally("Nafta cincuenta mil, supermercado treinta y dos mil", ctx);
    expect(items).toEqual([
      expect.objectContaining({ type: "EXPENSE", amount: "50000.00", description: "Nafta", category: "Transporte › Combustible", quote: "Nafta cincuenta mil" }),
      expect.objectContaining({ type: "EXPENSE", amount: "32000.00", category: "Supermercado", quote: "supermercado treinta y dos mil" }),
    ]);
    const { drafts } = validateInterpretation("Nafta cincuenta mil, supermercado treinta y dos mil", items, ctx, { local: true, newKey });
    expect(drafts.map((d) => d.amount)).toEqual(["50000.00", "32000.00"]);
    expect(drafts.every((d) => d.issues.map((i) => i.code).join() === "LOCAL")).toBe(true);
  });

  it("ingreso, fecha y cuenta", () => {
    const [income] = interpretLocally("ayer me ingresaron un pago de ciento cincuenta mil en el banco", ctx);
    expect(income).toMatchObject({ type: "INCOME", amount: "150000.00", date: "2026-11-04", accountMention: "en el banco" });
  });

  it("comercio conocido con su categoría habitual", () => {
    const [purchase] = interpretLocally("Farmacity sesenta y nueve mil quinientos con la visa", ctx);
    expect(purchase).toMatchObject({ merchant: "Farmacity", category: "Salud › Farmacia", accountMention: "visa", amount: "69500.00" });
  });

  it("separa importes sin separadores en los dos órdenes habituales", () => {
    expect(interpretLocally("gasté 50 mil en nafta y 32 mil en el super", ctx).map((i) => i.quote)).toEqual(["gasté 50 mil en nafta", "32 mil en el super"]);
    expect(interpretLocally("nafta 50 mil super 32 mil", ctx).map((i) => i.quote)).toEqual(["nafta 50 mil", "super 32 mil"]);
  });

  it("contexto sin importe se suma al movimiento", () => {
    const items = interpretLocally("ayer fui al super, gasté 32 mil", ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ date: "2026-11-04", category: "Supermercado" });
  });

  it("sin importes no hay movimientos", () => {
    expect(interpretLocally("cargué nafta", ctx)).toEqual([]);
  });
});
