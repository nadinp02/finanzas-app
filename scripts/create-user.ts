/**
 * Crea la cuenta de acceso (no hay registro público).
 *
 *   npm run user:create
 *   npm run user:create -- --email ana@ejemplo.com --name "Ana"
 *
 * Para automatizar, la contraseña puede pasarse en la variable NEW_PASSWORD.
 */
import { parseArgs } from "node:util";
import { createUser } from "@/modules/auth/service";
import { prisma } from "@/server/db";
import { loadEnv, prompt, promptHidden, reportError } from "./lib/cli";

loadEnv();

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" } },
});

try {
  const email = values.email ?? (await prompt("Email: "));
  const name = values.name ?? (await prompt("Nombre: "));
  let password = process.env.NEW_PASSWORD;
  if (!password) {
    password = await promptHidden("Contraseña (mínimo 10 caracteres): ");
    if ((await promptHidden("Repetí la contraseña: ")) !== password) {
      throw new Error("Las contraseñas no coinciden.");
    }
  }
  await createUser({ email, name, password });
  console.log(`✔ Cuenta creada para ${email}. Ya podés ingresar.`);
} catch (error) {
  reportError(error);
} finally {
  await prisma.$disconnect();
}
