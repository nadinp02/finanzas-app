import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS, type E2EUserKey } from "./constants";

/** Ingreso por la pantalla de login, como lo hace la usuaria. */
export async function loginThroughForm(page: Page, user: E2EUserKey, path = "/login"): Promise<void> {
  await page.goto(path);
  await page.getByLabel("Email").fill(E2E_USERS[user].email);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Fecha de hoy en Córdoba (YYYY-MM-DD), igual que la calcula la app. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date());
}

/**
 * Un día dentro del último resumen ya cerrado de una tarjeta que cierra el `closingDay` de cada mes:
 * el día 10 del mes del último cierre.
 */
export function dayInLastClosedStatement(closingDay: number, now = today()): string {
  const [year, month, day] = now.split("-").map(Number) as [number, number, number];
  const offset = day > closingDay ? 0 : -1;
  const index = year * 12 + (month - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-10`;
}

/** Importe entero como lo muestra la app: "$ 430.500" y "−$ 69.500" (espacio duro y signo menos tipográfico). */
export function pesos(value: number): RegExp {
  const digits = String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, "\\.");
  return new RegExp(`${value < 0 ? "−" : "(?<!−)"}\\$\\s${digits}(?![\\d.,])`);
}

/** La hoja inferior de alta/edición de movimientos. */
export function transactionSheet(page: Page): Locator {
  return page.getByRole("dialog");
}

/** Abre la hoja de alta desde Movimientos. */
export async function openNewTransaction(page: Page): Promise<Locator> {
  await page.goto("/movimientos");
  await page.getByRole("button", { name: "Nuevo" }).click();
  const sheet = transactionSheet(page);
  await expect(sheet.getByRole("heading", { name: "Nuevo movimiento" })).toBeVisible();
  // Espera a que carguen los datos de referencia (cuentas y categorías).
  await expect(sheet.getByRole("radiogroup", { name: "Cuenta" }).getByRole("radio").first()).toBeVisible();
  return sheet;
}

/** Elige una opción de un grupo de chips (`role=radiogroup`). */
export async function choose(scope: Locator, group: string, option: string): Promise<void> {
  await scope.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name: option, exact: true }).click();
}

/** Toca una categoría de la grilla (botones con aria-pressed). */
export async function pickCategory(sheet: Locator, name: string): Promise<void> {
  await sheet.getByRole("button", { name, exact: true }).click();
}

/** Guarda y espera el aviso de confirmación. */
export async function save(page: Page, sheet: Locator, buttonName: string, toast: string | RegExp): Promise<void> {
  await sheet.getByRole("button", { name: buttonName }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(toast).first()).toBeVisible();
}

/** Fila de un movimiento en una lista (botón que abre la edición). */
export function transactionRow(page: Page, description: string): Locator {
  return page.getByRole("button").filter({ has: page.getByText(description, { exact: true }) });
}

/** Saldo que muestra la pantalla Cuentas para una cuenta o tarjeta. */
export function accountLink(page: Page, name: string): Locator {
  return page.getByRole("link").filter({ has: page.getByText(name, { exact: true }) });
}
