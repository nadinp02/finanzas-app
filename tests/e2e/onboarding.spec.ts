import { expect, test } from "@playwright/test";
import { accountLink, loginThroughForm, pesos } from "./support/fixtures";

test("configuración inicial: cuentas con saldo, tarjeta con deuda previa y cuenta habitual", async ({ page }) => {
  await loginThroughForm(page, "onboarding");
  // Sin configuración inicial, cualquier pantalla de la app lleva a la bienvenida.
  await expect(page).toHaveURL(/\/bienvenida$/);
  await page.goto("/movimientos");
  await expect(page).toHaveURL(/\/bienvenida$/);
  await expect(page.getByRole("heading", { name: "Empecemos con tus saldos de hoy" })).toBeVisible();

  // Vienen tres cuentas sugeridas: Efectivo, Mercado Pago y Caja de ahorro.
  const names = page.getByLabel("Nombre de la cuenta");
  await expect(names).toHaveCount(3);
  const balances = page.getByLabel("Saldo actual");
  await balances.nth(0).fill("20000");
  await balances.nth(1).fill("15000");
  await balances.nth(2).fill("300000");

  await page.getByRole("button", { name: "Agregar tarjeta" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Visa");
  await page.getByLabel("Día de cierre").fill("26");
  await page.getByLabel("Día de vencimiento").fill("7");
  await page.getByRole("radiogroup", { name: "Cuenta de pago" }).getByRole("radio", { name: "Caja de ahorro" }).click();
  await page.getByLabel("Saldo del último resumen sin pagar").fill("50000");

  await page.getByRole("radiogroup", { name: "Cuenta habitual" }).getByRole("radio", { name: "Efectivo" }).click();
  await page.getByRole("button", { name: "Empezar" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Hola, Nora" })).toBeVisible();

  // La deuda previa resta del patrimonio pero no es un gasto.
  await page.goto("/cuentas");
  const main = page.getByRole("main");
  await expect(main.getByText("Disponible", { exact: true }).locator("..")).toContainText(pesos(335_000));
  // El resumen muestra la deuda como valor que resta (−); cada tarjeta, como monto adeudado.
  await expect(main.getByText("Deuda tarjetas", { exact: true }).locator("..")).toContainText(pesos(-50_000));
  await expect(accountLink(page, "Visa")).toContainText(pesos(50_000));
  await expect(main.getByText("Patrimonio", { exact: true }).locator("..")).toContainText(pesos(285_000));
  await expect(accountLink(page, "Caja de ahorro")).toContainText(pesos(300_000));

  await accountLink(page, "Visa").click();
  await expect(main.getByText(/^A pagar · resumen de/)).toBeVisible();
  await expect(main.getByText("Deuda total", { exact: true }).locator("..")).toContainText(pesos(50_000));

  // La bienvenida ya no está disponible.
  await page.goto("/bienvenida");
  await expect(page).toHaveURL(/\/$/);

  // La cuenta habitual elegida queda en las preferencias.
  await page.goto("/mas/preferencias");
  await expect(page.getByRole("radiogroup", { name: "Cuenta habitual" }).getByRole("radio", { name: "Efectivo" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
