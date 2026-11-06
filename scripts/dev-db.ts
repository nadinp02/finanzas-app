/**
 * PostgreSQL local para desarrollo sin Docker ni instalación del sistema.
 * Usa los binarios oficiales empaquetados por `embedded-postgres` y persiste en `.data/postgres`.
 *
 *   npm run db:dev        # dejarlo corriendo en una terminal
 *
 * DATABASE_URL="postgresql://postgres:postgres@localhost:5433/finanzas"
 */
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { stopCluster } from "./lib/pg";

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const DATABASE = process.env.DEV_DB_NAME ?? "finanzas";
const dataDir = path.resolve(".data/postgres");
const isInitialised = fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: PORT,
  user: "postgres",
  password: "postgres",
  authMethod: "scram-sha-256",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-c", "timezone=UTC"],
  onLog: () => {},
});

if (!isInitialised) {
  console.log(`Inicializando cluster en ${dataDir}…`);
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE]);
await client.end();
if (!rowCount) {
  await pg.createDatabase(DATABASE);
  console.log(`Base "${DATABASE}" creada.`);
}

console.log(`PostgreSQL escuchando en el puerto ${PORT}.`);
console.log(`DATABASE_URL="postgresql://postgres:postgres@localhost:${PORT}/${DATABASE}"`);
console.log("Ctrl+C para detenerlo.");

const shutdown = () => {
  stopCluster(dataDir);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Mantiene vivo el proceso: el cluster se detiene cuando este proceso termina.
setInterval(() => {}, 1 << 30);
