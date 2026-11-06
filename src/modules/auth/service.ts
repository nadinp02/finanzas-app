import "server-only";
import { AppError, errors } from "@/lib/errors";
import { audit } from "@/server/audit";
import { prisma, transaction } from "@/server/db";
import { seedUserDefaults } from "@/modules/onboarding/seed";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
import { passwordSchema } from "./schema";
import { invalidateAllSessions } from "./session";

export async function authenticate(email: string, password: string): Promise<{ id: string; name: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, passwordHash: true },
  });
  if (!user) return verifyAgainstDummy(password).then(() => null);
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? { id: user.id, name: user.name } : null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

/** Alta de usuaria con sus categorías y comercios iniciales. Solo se usa desde la línea de comandos. */
export async function createUser(input: CreateUserInput): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw errors.validation({ name: "Ingresá un nombre." });
  passwordSchema.parse(input.password);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw errors.conflict("EMAIL_TAKEN", `Ya existe una cuenta con el email ${email}.`);
  }
  const passwordHash = await hashPassword(input.password);
  return transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name, passwordHash }, select: { id: true } });
    await seedUserDefaults(tx, user.id);
    await audit({ userId: user.id, action: "USER_CREATED" }, tx);
    return user;
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError("INVALID_CREDENTIALS", "La contraseña actual no es correcta.", 422, {
      currentPassword: "La contraseña actual no es correcta.",
    });
  }
  await setPassword(userId, newPassword);
}

/** Recuperación de acceso por línea de comandos: cambia la contraseña y cierra todas las sesiones. */
export async function resetPassword(email: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw errors.notFound(`No existe una cuenta con el email ${email}.`);
  await setPassword(user.id, newPassword);
}

async function setPassword(userId: string, newPassword: string): Promise<void> {
  passwordSchema.parse(newPassword);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await invalidateAllSessions(userId);
  await audit({ userId, action: "PASSWORD_CHANGED" });
}
