import path from "node:path";

/** Puertos fijos: el servidor E2E se levanta antes que el setup global y necesita conocerlos. */
export const E2E_DB_PORT = Number(process.env.E2E_DB_PORT ?? 5435);
export const E2E_APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_APP_PORT}`;
export const E2E_DATABASE_URL = `postgresql://postgres:postgres@localhost:${E2E_DB_PORT}/finanzas_e2e`;
export const E2E_DATA_DIR = path.resolve(".data/postgres-e2e");

export const E2E_PASSWORD = "clave-de-prueba-e2e";

/**
 * Una usuaria por escenario para que las pruebas no compartan estado. Las «configuradas» arrancan con
 * Efectivo ($ 50.000), Banco ($ 500.000) y una Visa (cierre 26, vencimiento 7) pagada desde Banco.
 */
export const E2E_USERS = {
  login: { email: "login@e2e.local", name: "Lucía", onboarded: true },
  onboarding: { email: "nueva@e2e.local", name: "Nora", onboarded: false },
  manual: { email: "manual@e2e.local", name: "Marta", onboarded: true },
  card: { email: "tarjeta@e2e.local", name: "Tamara", onboarded: true },
  settings: { email: "ajustes@e2e.local", name: "Ana", onboarded: true },
  dashboard: { email: "inicio@e2e.local", name: "Inés", onboarded: true },
} as const;

export type E2EUserKey = keyof typeof E2E_USERS;
