/**
 * Servidor de las pruebas E2E (lo lanza Playwright como `webServer`, antes del setup global):
 * PostgreSQL embebido y descartable, migraciones, datos de prueba y `next start` sobre el build de
 * producción (`npm run build`). Playwright mata este proceso al terminar; en Windows eso no deja correr
 * manejadores, así que el cluster lo detiene `global-teardown.ts` y, por las dudas, el próximo arranque.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { stopCluster } from "../../../scripts/lib/pg";
import { E2E_APP_PORT, E2E_DATA_DIR, E2E_DATABASE_URL, E2E_DB_PORT } from "./constants";

if (!fs.existsSync(path.resolve(".next/BUILD_ID"))) {
  console.error("No hay build de producción: corré `npm run build` antes de las pruebas E2E.");
  process.exit(1);
}

// Un cluster que quedó vivo de una corrida interrumpida.
if (fs.existsSync(path.join(E2E_DATA_DIR, "PG_VERSION"))) stopCluster(E2E_DATA_DIR, "immediate");
fs.rmSync(E2E_DATA_DIR, { recursive: true, force: true });

const pg = new EmbeddedPostgres({
  databaseDir: E2E_DATA_DIR,
  port: E2E_DB_PORT,
  user: "postgres",
  password: "postgres",
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-c", "timezone=UTC", "-c", "fsync=off", "-c", "synchronous_commit=off"],
  onLog: () => {},
});
await pg.initialise();
await pg.start();
await pg.createDatabase("finanzas_e2e");

const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, stdio: "pipe" });
execFileSync(
  process.execPath,
  [path.resolve("node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", "tests/e2e/support/seed.ts"],
  { env, stdio: "inherit" },
);

const next = spawn(
  process.execPath,
  [path.resolve("node_modules/next/dist/bin/next"), "start", "--port", String(E2E_APP_PORT)],
  { env: { ...env, NODE_ENV: "production" }, stdio: "inherit" },
);

const shutdown = () => {
  next.kill();
  stopCluster(E2E_DATA_DIR, "immediate");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", (code) => {
  stopCluster(E2E_DATA_DIR, "immediate");
  process.exit(code ?? 0);
});
