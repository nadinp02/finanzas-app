import { expect, test, type Page } from "@playwright/test";
import {
  accountLink,
  choose,
  loginThroughForm,
  openNewTransaction,
  pesos,
  pickCategory,
  save,
  transactionRow,
  transactionSheet,
} from "./support/fixtures";

// Una sola usuaria (Efectivo $ 50.000 y Banco $ 500.000): cada paso parte de los saldos del anterior.
test.describe.configure({ mode: "serial" });

async function expectBalances(page: Page, balances: Record<string, number>) {
  await page.goto("/cuentas");
  for (const [name, value] of Object.entries(balances)) {
    await expect(accountLink(page, name)).toContainText(pesos(value));
  }
}

test.describe("carga manual", () => {
  test.beforeEach(async ({ page }) => {
    await loginThroughForm(page, "manual");
  });

  test("gasto en efectivo, ingreso y transferencia actualizan los saldos", async ({ page }) => {
    // Gasto: la cuenta habitual (Efectivo) viene preseleccionada y la fecha es hoy.
    let sheet = await openNewTransaction(page);
    await expect(sheet.getByRole("radiogroup", { name: "Cuenta", exact: true }).getByRole("radio", { name: "Efectivo" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(sheet.getByRole("radiogroup", { name: "Fecha" }).getByRole("radio", { name: "Hoy" })).toHaveAttribute("aria-checked", "true");
    await sheet.getByLabel("Importe").fill("12500");
    await pickCategory(sheet, "Supermercado");
    await sheet.getByLabel("Comercio (opcional)").fill("Almacén Don Pepe");
    await save(page, sheet, "Guardar gasto", "Gasto · $ 12.500 guardado");
    await expect(transactionRow(page, "Almacén Don Pepe")).toContainText(pesos(-12_500));

    // Sin categoría no se guarda.
    sheet = await openNewTransaction(page);
    await sheet.getByLabel("Importe").fill("1000");
    await sheet.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(sheet.getByRole("alert")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Ingreso al banco.
    sheet = await openNewTransaction(page);
    await choose(sheet, "Tipo de movimiento", "Ingreso");
    await sheet.getByLabel("Importe").fill("800000");
    await pickCategory(sheet, "Sueldo");
    await choose(sheet, "Cuenta", "Banco");
    await save(page, sheet, "Guardar ingreso", "Ingreso · $ 800.000 guardado");

    // Transferencia del banco al efectivo: no es gasto ni ingreso.
    sheet = await openNewTransaction(page);
    await choose(sheet, "Tipo de movimiento", "Transferencia");
    await sheet.getByLabel("Importe").fill("30000");
    await choose(sheet, "Cuenta", "Banco");
    await choose(sheet, "Cuenta destino", "Efectivo");
    await save(page, sheet, "Guardar transferencia", "Transferencia · $ 30.000 guardado");
    await expect(transactionRow(page, "Transferencia a Efectivo").first()).not.toContainText("−");

    await expectBalances(page, { Efectivo: 67_500, Banco: 1_270_000 });
  });

  test("editar un movimiento recalcula los saldos y eliminarlo los restaura", async ({ page }) => {
    await page.goto("/movimientos");
    await transactionRow(page, "Almacén Don Pepe").click();
    let sheet = transactionSheet(page);
    await expect(sheet.getByRole("heading", { name: "Editar movimiento" })).toBeVisible();
    await expect(sheet.getByLabel("Importe")).toHaveValue("12.500");
    await sheet.getByLabel("Importe").fill("15000");
    await sheet.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados")).toBeVisible();
    await expect(transactionRow(page, "Almacén Don Pepe")).toContainText(pesos(-15_000));
    await expectBalances(page, { Efectivo: 65_000 });

    await page.goto("/movimientos");
    await transactionRow(page, "Almacén Don Pepe").click();
    sheet = transactionSheet(page);
    page.once("dialog", (dialog) => dialog.accept());
    await sheet.getByRole("button", { name: "Eliminar movimiento" }).click();
    await expect(page.getByText("Movimiento eliminado")).toBeVisible();
    await expect(transactionRow(page, "Almacén Don Pepe")).toHaveCount(0);
    await expectBalances(page, { Efectivo: 80_000 });
  });

  test("«Deshacer» en el aviso borra el movimiento recién guardado", async ({ page }) => {
    const sheet = await openNewTransaction(page);
    await sheet.getByLabel("Importe").fill("4300");
    await pickCategory(sheet, "Salidas");
    await sheet.getByLabel("Comercio (opcional)").fill("Café Martínez");
    await save(page, sheet, "Guardar gasto", "Gasto · $ 4.300 guardado");
    await expect(transactionRow(page, "Café Martínez")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByText("Movimiento deshecho")).toBeVisible();
    await expect(transactionRow(page, "Café Martínez")).toHaveCount(0);
    await expectBalances(page, { Efectivo: 80_000 });
  });

  test("búsqueda y filtros", async ({ page }) => {
    await page.goto("/movimientos");
    const search = page.getByRole("searchbox", { name: "Buscar movimientos" });
    await search.fill("transferencia");
    await search.press("Enter");
    await expect(page).toHaveURL(/q=transferencia/);
    await expect(transactionRow(page, "Transferencia a Efectivo").first()).toBeVisible();
    await expect(page.getByRole("main").getByText("Sueldo")).toHaveCount(0);

    await page.goto("/movimientos");
    await page.getByRole("button", { name: "Filtros" }).click();
    await page.getByLabel("Tipo", { exact: true }).selectOption({ label: "Ingreso" });
    await expect(page).toHaveURL(/type=INCOME/);
    await expect(page.getByRole("main").getByText(pesos(800_000))).toBeVisible();
    await expect(transactionRow(page, "Transferencia a Efectivo")).toHaveCount(0);
  });

  test("ajuste de saldo: registra la diferencia sin contarla como gasto", async ({ page }) => {
    await page.goto("/cuentas");
    await accountLink(page, "Efectivo").click();
    await page.getByRole("button", { name: "Ajustar saldo" }).click();
    await page.getByLabel("¿Cuánto hay realmente hoy?").fill("78000");
    await page.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(page.getByText(/Ajuste registrado: −\$\s2\.000/)).toBeVisible();
    await expectBalances(page, { Efectivo: 78_000 });
  });
});
