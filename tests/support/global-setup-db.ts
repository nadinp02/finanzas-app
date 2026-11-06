import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { TestProject } from "vitest/node";
import { stopCluster } from "../../scripts/lib/pg";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** PostgreSQL real y descartable para las pruebas de integración, con las migraciones aplicadas. */
export default async function setup(project: TestProject) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuentas-test-pg-"));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "timezone=UTC", "-c", "fsync=off", "-c", "synchronous_commit=off"],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("finanzas_test");

  const databaseUrl = `postgresql://postgres:postgres@localhost:${port}/finanzas_test`;
  execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    stopCluster(dataDir, "immediate");
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
