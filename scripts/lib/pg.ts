import { execFileSync } from "node:child_process";
import path from "node:path";

/** Ruta a pg_ctl dentro de los binarios que instala `embedded-postgres` para esta plataforma. */
export function pgCtlPath(): string {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const executable = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
  return path.resolve("node_modules/@embedded-postgres", `${platform}-${process.arch}`, "native/bin", executable);
}

/**
 * Detiene un cluster con pg_ctl. `embedded-postgres` usa `taskkill /t` en Windows, que deja vivos
 * los procesos io_worker de PostgreSQL 18; pg_ctl apaga el postmaster junto con todos sus hijos.
 */
export function stopCluster(dataDir: string, mode: "fast" | "immediate" = "fast"): void {
  try {
    execFileSync(pgCtlPath(), ["stop", "-D", dataDir, "-m", mode, "-w"], { stdio: "ignore" });
  } catch {
    // Ya estaba detenido.
  }
}
