import { expect, test } from "@playwright/test";
import { E2E_USERS } from "./support/constants";
import { loginThroughForm } from "./support/fixtures";

test.describe("acceso", () => {
  test("sin sesión redirige al login conservando el destino", async ({ page }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/login\?next=%2Fmovimientos$/);
    await expect(page.getByRole("heading", { name: "Hola de nuevo" })).toBeVisible();
  });

  test("rechaza una contraseña incorrecta sin revelar si el email existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_USERS.login.email);
    await page.getByLabel("Contraseña").fill("no-es-la-clave");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email o contraseña incorrectos." })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("ingresa, vuelve al destino pedido, mantiene la sesión y la cierra", async ({ page, context }) => {
    await loginThroughForm(page, "login", "/login?next=%2Fmovimientos");
    await expect(page).toHaveURL(/\/movimientos$/);

    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === "__Host-cc_session");
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

    // La sesión sobrevive a una recarga.
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/mas");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/cuentas");
    await expect(page).toHaveURL(/\/login\?next=%2Fcuentas$/);
  });
});
