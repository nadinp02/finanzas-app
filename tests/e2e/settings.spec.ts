import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./support/constants";
import { accountLink, choose, loginThroughForm, openNewTransaction, pesos, pickCategory, save, transactionRow } from "./support/fixtures";

test.describe.configure({ mode: "serial" });

test.describe("configuración", () => {
  test.beforeEach(async ({ page }) => {
    await loginThroughForm(page, "settings");
  });

  test("categoría nueva y borrado con reasignación de sus movimientos", async ({ page }) => {
    await page.goto("/mas/categorias");
    await page.getByRole("button", { name: "Nueva" }).click();
    let sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre").fill("Mascotas");
    await sheet.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Categoría creada")).toBeVisible();

    sheet = await openNewTransaction(page);
    await sheet.getByLabel("Importe").fill("8000");
    await pickCategory(sheet, "Mascotas");
    await sheet.getByLabel("Comercio (opcional)").fill("Alimento balanceado");
    await save(page, sheet, "Guardar gasto", "Gasto · $ 8.000 guardado");
    await expect(transactionRow(page, "Alimento balanceado")).toContainText("Mascotas");

    // Con movimientos no se borra sin decir a dónde van.
    await page.goto("/mas/categorias");
    await page.getByRole("button", { name: "Eliminar Mascotas" }).click();
    sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(sheet.getByLabel("Mover sus movimientos a")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Mover y eliminar" })).toBeDisabled();
    await sheet.getByLabel("Mover sus movimientos a").selectOption({ label: "Otros" });
    await sheet.getByRole("button", { name: "Mover y eliminar" }).click();
    await expect(page.getByText("Categoría eliminada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Eliminar Mascotas" })).toHaveCount(0);

    await page.goto("/movimientos");
    await expect(transactionRow(page, "Alimento balanceado")).toContainText("Otros");
  });

  test("comercio nuevo con categoría habitual: se sugiere al cargar", async ({ page }) => {
    await page.goto("/mas/comercios");
    await page.getByRole("button", { name: "Nuevo" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre").fill("Veterinaria Lola");
    await sheet.getByLabel("Variantes (separadas por coma)").fill("la vete, lola");
    await sheet.getByLabel("Categoría habitual").selectOption({ label: "Salud" });
    await sheet.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Comercio guardado")).toBeVisible();

    const form = await openNewTransaction(page);
    await form.getByLabel("Comercio (opcional)").fill("Veter");
    await form.getByRole("button", { name: "Veterinaria Lola", exact: true }).click();
    await expect(form.getByRole("button", { name: "Salud", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("alta de cuenta y cuenta habitual: el orden pone las tarjetas al final", async ({ page }) => {
    await page.goto("/cuentas");
    await page.getByRole("button", { name: "Cuenta", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre").fill("Mercado Pago");
    await choose(sheet, "Tipo de cuenta", "Billetera virtual");
    await sheet.getByLabel("Saldo inicial", { exact: true }).fill("10000");
    await sheet.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Cuenta creada")).toBeVisible();
    await expect(accountLink(page, "Mercado Pago")).toContainText(pesos(10_000));

    await page.goto("/mas/preferencias");
    const chips = page.getByRole("radiogroup", { name: "Cuenta habitual" }).getByRole("radio");
    await expect(chips).toHaveText(["Efectivo", "Banco", "Mercado Pago", "Visa"]);
    await chips.filter({ hasText: "Mercado Pago" }).click();
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await expect(page.getByText("Preferencias guardadas")).toBeVisible();

    const form = await openNewTransaction(page);
    await expect(form.getByRole("radiogroup", { name: "Cuenta", exact: true }).getByRole("radio", { name: "Mercado Pago" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("cambio de contraseña: valida la actual y obliga a volver a ingresar", async ({ page }) => {
    const newPassword = "otra-clave-segura-1";
    await page.goto("/mas/preferencias");
    await page.getByLabel("Contraseña actual").fill("no-es-la-actual");
    await page.getByLabel("Contraseña nueva").fill(newPassword);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("La contraseña actual no es correcta.")).toBeVisible();

    await page.getByLabel("Contraseña actual").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(E2E_USERS.settings.email);
    await page.getByLabel("Contraseña").fill(newPassword);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });
});
