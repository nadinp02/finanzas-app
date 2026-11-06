import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_PORT, E2E_BASE_URL } from "./tests/e2e/support/constants";

/**
 * E2E sobre el build de producción (`npm run build` antes) con PostgreSQL embebido y descartable.
 * Chromium con viewport de iPhone: la app se usa sobre todo desde el teléfono.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Cada escenario usa su propia usuaria, pero comparten servidor y base: en serie es más estable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: E2E_BASE_URL,
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    // El service worker cachea páginas y estáticos; solo lo necesitan las pruebas offline.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "iphone",
      // Viewport, escala y táctil de iPhone sobre Chromium (el único navegador instalado).
      use: { ...devices["iPhone 15"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npx tsx tests/e2e/support/server.ts",
    url: `${E2E_BASE_URL}/login`,
    // Solo para depurar contra un servidor ya levantado (los datos no se reinician entre corridas).
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { E2E_APP_PORT: String(E2E_APP_PORT) },
  },
});
