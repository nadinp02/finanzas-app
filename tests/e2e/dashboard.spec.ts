import { expect, test, type Page } from "@playwright/test";
import { choose, dayInLastClosedStatement, loginThroughForm, openNewTransaction, pesos, pickCategory, save, today } from "./support/fixtures";

function stat(page: Page, label: string) {
  // Solo la etiqueta del dato (<p>), no un título de sección con el mismo texto.
  return page.getByRole("main").locator("p").filter({ hasText: new RegExp(`^${label}$`) }).locator("..");
}

test("inicio: totales del mes, categorías, patrimonio, vencimientos y navegación entre meses", async ({ page }) => {
  await loginThroughForm(page, "dashboard");
  const main = page.getByRole("main");

  // Sin movimientos: todo en cero y el patrimonio inicial (50.000 + 500.000).
  await expect(main.getByRole("heading", { name: "Hola, Inés" })).toBeVisible();
  await expect(stat(page, "Gastos del mes hasta hoy")).toContainText(pesos(0));
  await expect(stat(page, "Patrimonio")).toContainText(pesos(550_000));

  let sheet = await openNewTransaction(page);
  await sheet.getByLabel("Importe").fill("12500");
  await pickCategory(sheet, "Supermercado");
  await save(page, sheet, "Guardar gasto", "Gasto · $ 12.500 guardado");

  sheet = await openNewTransaction(page);
  await choose(sheet, "Tipo de movimiento", "Ingreso");
  await sheet.getByLabel("Importe").fill("100000");
  await pickCategory(sheet, "Sueldo");
  await choose(sheet, "Cuenta", "Banco");
  await save(page, sheet, "Guardar ingreso", "Ingreso · $ 100.000 guardado");

  // Una compra con tarjeta del resumen ya cerrado: cuenta como gasto del mes de la compra y aparece a pagar.
  const purchaseDate = dayInLastClosedStatement(26);
  sheet = await openNewTransaction(page);
  await sheet.getByLabel("Importe").fill("30000");
  await pickCategory(sheet, "Salud");
  await choose(sheet, "Cuenta", "Visa");
  await sheet.getByLabel("Otra fecha").fill(purchaseDate);
  await save(page, sheet, "Guardar gasto", "Gasto · $ 30.000 guardado");

  const sameMonth = purchaseDate.slice(0, 7) === today().slice(0, 7);
  const monthExpense = sameMonth ? 42_500 : 12_500;

  await page.goto("/");
  await expect(stat(page, "Gastos del mes hasta hoy")).toContainText(pesos(monthExpense));
  await expect(stat(page, "Ingresos")).toContainText(pesos(100_000));
  await expect(stat(page, "Ahorro del mes")).toContainText(pesos(100_000 - monthExpense));
  await expect(main.getByRole("link", { name: /^Supermercado/ }).locator("[data-amount]")).toHaveText(pesos(12_500));
  await expect(main.getByRole("link", { name: /^Supermercado/ })).toContainText(sameMonth ? "29 %" : "100 %");
  await expect(main.getByRole("img", { name: /Gasto acumulado por día/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /^Visa (Vence|Vencido) el/ })).toContainText(pesos(30_000));
  // 550.000 + 100.000 − 12.500 disponibles; 30.000 de deuda; ahorro acumulado = ingresos − gastos.
  await expect(stat(page, "Disponible")).toContainText(pesos(637_500));
  await expect(stat(page, "Deuda tarjetas")).toContainText(pesos(30_000));
  await expect(stat(page, "Patrimonio")).toContainText(pesos(607_500));
  await expect(main.getByText(/^Ahorro acumulado desde/).locator("..")).toContainText(pesos(57_500));
  await expect(main.getByRole("heading", { name: "Últimos movimientos" })).toBeVisible();

  // Navegación: hacia atrás hasta el mes de inicio (dos meses antes); hacia adelante, hasta hoy.
  await expect(main.getByRole("link", { name: "Mes siguiente" })).toHaveCount(0);
  await main.getByRole("link", { name: "Mes anterior" }).click();
  await expect(page).toHaveURL(/\?mes=\d{4}-\d{2}$/);
  await expect(stat(page, "Gastos del mes")).toContainText(pesos(sameMonth ? 0 : 30_000));
  await expect(main.getByText(/^Saldos al /)).toBeVisible();
  await main.getByRole("link", { name: "Mes anterior" }).click();
  await expect(main.getByRole("link", { name: "Mes anterior" })).toHaveCount(0);
  await expect(main.getByText("Todavía no hay movimientos este mes.")).toBeVisible();

  // Un mes anterior al inicio del registro muestra un estado vacío explicativo.
  const [year, month] = today().split("-").map(Number) as [number, number];
  const index = year * 12 + (month - 1) - 3;
  await page.goto(`/?mes=${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  await expect(main.getByText("Este mes es anterior al inicio del registro")).toBeVisible();
});
