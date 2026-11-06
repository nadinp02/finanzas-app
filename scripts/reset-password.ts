/**
 * Recupera el acceso: define una contraseña nueva y cierra todas las sesiones abiertas.
 * Requiere acceso a la base (DATABASE_URL), por eso solo puede hacerlo quien administra la app.
 *
 *   npm run user:reset-password -- --email ana@ejemplo.com
 */
import { parseArgs } from "node:util";
import { resetPassword } from "@/modules/auth/service";
import { prisma } from "@/server/db";
import { loadEnv, prompt, promptHidden, reportError } from "./lib/cli";

loadEnv();

const { values } = parseArgs({ options: { email: { type: "string" } } });

try {
  const email = values.email ?? (await prompt("Email de la cuenta: "));
  let password = process.env.NEW_PASSWORD;
  if (!password) {
    password = await promptHidden("Contraseña nueva (mínimo 10 caracteres): ");
    if ((await promptHidden("Repetí la contraseña: ")) !== password) {
      throw new Error("Las contraseñas no coinciden.");
    }
  }
  await resetPassword(email, password);
  console.log("✔ Contraseña actualizada. Se cerraron las sesiones abiertas.");
} catch (error) {
  reportError(error);
} finally {
  await prisma.$disconnect();
}
