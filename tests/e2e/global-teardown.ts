import fs from "node:fs";
import { stopCluster } from "../../scripts/lib/pg";
import { E2E_DATA_DIR } from "./support/constants";

/** Corre antes de que Playwright mate el webServer: apaga PostgreSQL con pg_ctl y borra sus datos. */
export default function globalTeardown() {
  stopCluster(E2E_DATA_DIR, "immediate");
  fs.rmSync(E2E_DATA_DIR, { recursive: true, force: true });
}
