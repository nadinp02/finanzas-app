import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_OUTBOX_FILE, E2E_PASSWORD, E2E_USERS } from "./support/constants";

/**
 * Registro público y recuperación de contraseña por email. El servidor E2E escribe los emails en
 * E2E_OUTBOX_FILE en lugar de enviarlos: la prueba lee de ahí el enlace, como lo haría desde su casilla.
 */

interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
}

function emailsTo(address: string): OutboxEmail[] {
  if (!fs.existsSync(E2E_OUTBOX_FILE)) return [];
  return fs
    .readFileSync(E2E_OUTBOX_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxEmail)
    .filter((email) => email.to === address);
}

/** El email se envía después de responder: se espera a que llegue. */
async function resetLinkFor(address: string, previous = 0): Promise<string> {
  await expect.poll(() => emailsTo(address).length, { timeout: 10_000 }).toBeGreaterThan(previous);
  const email = emailsTo(address).at(-1)!;
  const url = /https?:\/\/\S+\/restablecer\?token=\S+/.exec(email.text)?.[0];
  expect(url).toBeTruthy();
  return url!;
}

async function register(page: Page, values: { name: string; email: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("link", { name: "Creá una" }).click();
  await expect(page.getByRole("heading", { name: "Creá tu cuenta" })).toBeVisible();
  await page.getByLabel("Nombre").fill(values.name);
  await page.getByLabel("Email").fill(values.email);
  await page.getByLabel("Contraseña").fill(values.password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

test.describe("cuentas", () => {
  test("cualquiera crea su cuenta y entra a configurar sus propios medios de pago", async ({ page }) => {
    await register(page, { name: "Camila", email: "camila@e2e.local", password: "clave-de-camila-1" });
    await expect(page).toHaveURL(/\/bienvenida$/);
    await expect(page.getByRole("heading", { name: "Empecemos con tus saldos de hoy" })).toBeVisible();

    // La sesión quedó iniciada: cerrar la pestaña y volver no pide ingresar.
    await page.goto("/");
    await expect(page).toHaveURL(/\/bienvenida$/);
  });

  test("valida el formulario y no permite repetir un email", async ({ page }) => {
    await register(page, { name: "", email: "no-es-email", password: "corta" });
    await expect(page.getByText("Ingresá tu nombre.")).toBeVisible();
    await expect(page.getByText("Ingresá un email válido.")).toBeVisible();
    await expect(page.getByText("Usá al menos 10 caracteres.")).toBeVisible();

    await page.getByLabel("Nombre").fill("Otra Lucía");
    await page.getByLabel("Email").fill(E2E_USERS.login.email);
    await page.getByLabel("Contraseña").fill("una-clave-larga-1");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("alert").filter({ hasText: `Ya existe una cuenta con el email ${E2E_USERS.login.email}.` })).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test("recupera la contraseña con el enlace del email; el enlace sirve una vez", async ({ page }) => {
    const address = E2E_USERS.recover.email;
    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste la contraseña?" }).click();
    await page.getByLabel("Email de tu cuenta").fill(address);
    await page.getByRole("button", { name: "Mandarme el enlace" }).click();
    await expect(page.getByRole("status")).toContainText(`Si hay una cuenta con ${address}, te mandamos un enlace`);

    const link = await resetLinkFor(address);
    expect(emailsTo(address).at(-1)!.subject).toContain("Restablecer tu contraseña");
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Elegí una contraseña nueva" })).toBeVisible();
    // El token se quita de la barra de direcciones.
    await expect(page).toHaveURL(/\/restablecer$/);

    await page.getByLabel("Contraseña nueva").fill("clave-recuperada-1");
    await page.getByLabel("Repetí la contraseña").fill("otra-cosa-distinta");
    await page.getByRole("button", { name: "Guardar e ingresar" }).click();
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();

    await page.getByLabel("Repetí la contraseña").fill("clave-recuperada-1");
    await page.getByRole("button", { name: "Guardar e ingresar" }).click();
    await expect(page).toHaveURL(/\/$/);

    // La contraseña anterior ya no sirve; la nueva sí.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(address);
    await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email o contraseña incorrectos." })).toBeVisible();
    await page.getByLabel("Contraseña").fill("clave-recuperada-1");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // Reusar el enlace no funciona.
    await page.context().clearCookies();
    await page.goto(link);
    await page.getByLabel("Contraseña nueva").fill("una-tercera-clave");
    await page.getByLabel("Repetí la contraseña").fill("una-tercera-clave");
    await page.getByRole("button", { name: "Guardar e ingresar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "El enlace no es válido o ya venció. Pedí uno nuevo." })).toBeVisible();
  });

  test("con un email sin cuenta responde igual y no manda nada", async ({ page }) => {
    await page.goto("/recuperar");
    await page.getByLabel("Email de tu cuenta").fill("nadie@e2e.local");
    await page.getByRole("button", { name: "Mandarme el enlace" }).click();
    await expect(page.getByRole("status")).toContainText("Si hay una cuenta con nadie@e2e.local, te mandamos un enlace");
    await page.waitForTimeout(500);
    expect(emailsTo("nadie@e2e.local")).toHaveLength(0);
  });
});
