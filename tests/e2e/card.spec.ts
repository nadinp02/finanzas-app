import { expect, test } from "@playwright/test";
import {
  accountLink,
  choose,
  dayInLastClosedStatement,
  loginThroughForm,
  openNewTransaction,
  pesos,
  pickCategory,
  save,
  transactionRow,
  transactionSheet,
} from "./support/fixtures";

// Una sola usuaria para todo el recorrido: cada paso depende del anterior.
test.describe.configure({ mode: "serial" });

test.describe("tarjeta de crédito (ejemplo crítico)", () => {
  test("compra de $ 69.500 y pago del resumen desde el banco: el gasto se cuenta una sola vez", async ({ page }) => {
    await loginThroughForm(page, "card");
    const purchaseDate = dayInLastClosedStatement(26);

    // Compra con tarjeta: el comercio sugiere su categoría habitual.
    const sheet = await openNewTransaction(page);
    await sheet.getByLabel("Importe").fill("69500");
    await sheet.getByLabel("Comercio (opcional)").fill("Farmac");
    await sheet.getByRole("button", { name: "Farmacity", exact: true }).click();
    await expect(sheet.getByRole("radiogroup", { name: "Subcategoría" }).getByRole("radio", { name: "Farmacia" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await choose(sheet, "Cuenta", "Visa");
    await expect(sheet.getByRole("radiogroup", { name: "Cuotas" })).toBeVisible();
    await sheet.getByLabel("Otra fecha").fill(purchaseDate);
    await save(page, sheet, "Guardar gasto", "Gasto · $ 69.500 guardado");

    // Antes de pagar: banco intacto, deuda de la tarjeta.
    await page.goto("/cuentas");
    await expect(accountLink(page, "Banco")).toContainText(pesos(500_000));
    await expect(accountLink(page, "Visa")).toContainText(pesos(69_500));

    // El resumen cerrado muestra lo que hay que pagar.
    await accountLink(page, "Visa").click();
    await expect(page.getByRole("heading", { name: "Visa" })).toBeVisible();
    await expect(page.getByRole("main").getByText(/^A pagar · resumen de/)).toBeVisible();
    await page.getByRole("button", { name: "Pagar resumen" }).click();

    // La hoja llega precargada: importe del resumen, desde Banco hacia la Visa.
    const payment = transactionSheet(page);
    await expect(payment.getByRole("radiogroup", { name: "Tipo de movimiento" }).getByRole("radio", { name: "Pago de tarjeta" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(payment.getByLabel("Importe")).toHaveValue("69.500");
    await expect(payment.getByRole("radiogroup", { name: "Cuenta", exact: true }).getByRole("radio", { name: "Banco" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(payment.getByRole("radiogroup", { name: "Cuenta destino" }).getByRole("radio", { name: "Visa" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await save(page, payment, "Guardar pago", "Pago de tarjeta · $ 69.500 guardado");

    await expect(page.getByRole("main").getByText("Nada para pagar ahora")).toBeVisible();
    await expect(page.getByRole("main").getByText("Pagado").first()).toBeVisible();

    // Banco 500.000 → 430.500 y deuda 0.
    await page.goto("/cuentas");
    await expect(accountLink(page, "Banco")).toContainText(pesos(430_500));
    await expect(accountLink(page, "Visa")).toContainText(pesos(0));
    await expect(page.getByRole("main").getByText("Deuda tarjetas", { exact: true }).locator("..")).toContainText(pesos(0));

    // En la lista: un solo gasto de 69.500; el pago es un movimiento neutro (sin signo).
    await page.goto("/movimientos");
    await expect(transactionRow(page, "Farmacity")).toHaveCount(1);
    await expect(transactionRow(page, "Farmacity")).toContainText(pesos(-69_500));
    await expect(transactionRow(page, "Pago de Visa")).toContainText(pesos(69_500));
    await expect(transactionRow(page, "Pago de Visa")).not.toContainText("−");
  });

  test("compra en cuotas: una cuota por resumen y el resto como cuotas futuras", async ({ page }) => {
    await loginThroughForm(page, "card");
    const sheet = await openNewTransaction(page);
    await sheet.getByLabel("Importe").fill("120000");
    await pickCategory(sheet, "Compras");
    await choose(sheet, "Cuenta", "Visa");
    await choose(sheet, "Cuotas", "3");
    await sheet.getByRole("button", { name: "Más opciones" }).click();
    await sheet.getByLabel("Descripción").fill("Heladera");
    await save(page, sheet, "Guardar gasto", "Gasto · $ 120.000 guardado");

    await expect(transactionRow(page, "Heladera")).toContainText("3 cuotas");
    await expect(transactionRow(page, "Heladera")).toContainText(pesos(40_000));

    await page.goto("/cuentas");
    await accountLink(page, "Visa").click();
    await expect(page.getByRole("main").getByText("Próximo resumen", { exact: true }).locator("..")).toContainText(pesos(40_000));
    await expect(page.getByRole("main").getByText("Cuotas futuras", { exact: true }).locator("..")).toContainText(pesos(80_000));
    await expect(page.getByRole("main").getByText("Deuda total", { exact: true }).locator("..")).toContainText(pesos(120_000));
    await expect(page.getByRole("main").getByText("Cuota 1 de 3")).toBeVisible();
  });

  test("pago parcial del resumen: queda el remanente a pagar", async ({ page }) => {
    await loginThroughForm(page, "card");
    const sheet = await openNewTransaction(page);
    await sheet.getByLabel("Importe").fill("100000");
    await pickCategory(sheet, "Supermercado");
    await choose(sheet, "Cuenta", "Visa");
    await sheet.getByLabel("Otra fecha").fill(dayInLastClosedStatement(26));
    await save(page, sheet, "Guardar gasto", "Gasto · $ 100.000 guardado");

    await page.goto("/cuentas");
    await accountLink(page, "Visa").click();
    const main = page.getByRole("main");
    // El resumen ya tenía la compra de $ 69.500 pagada: ahora restan los $ 100.000 nuevos.
    await expect(main.getByText(/^(A pagar|Vencido) · resumen de/).locator("..")).toContainText(pesos(100_000));
    await page.getByRole("button", { name: "Pagar resumen" }).click();
    const payment = transactionSheet(page);
    await expect(payment.getByLabel("Importe")).toHaveValue("100.000");
    await payment.getByLabel("Importe").fill("40000");
    await save(page, payment, "Guardar pago", "Pago de tarjeta · $ 40.000 guardado");

    await expect(main.getByText(/^(A pagar|Vencido) · resumen de/).locator("..")).toContainText(pesos(60_000));
    await expect(main.getByText(/^Ya pagaste/)).toContainText(pesos(109_500));
    await expect(main.getByText(/^Ya pagaste/)).toContainText(pesos(169_500));

    await page.goto("/cuentas");
    await expect(accountLink(page, "Banco")).toContainText(pesos(390_500));
  });
});
