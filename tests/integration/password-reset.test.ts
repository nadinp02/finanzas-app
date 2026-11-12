import { describe, expect, it } from "vitest";
import { confirmPasswordReset, createPasswordResetLink, passwordResetEmail, RESET_TOKEN_TTL_MS } from "@/modules/auth/password-reset";
import { authenticate, createUser } from "@/modules/auth/service";
import { createSession, validateSessionToken } from "@/modules/auth/session";
import { prisma } from "@/server/db";

const PASSWORD = "una-clave-segura";
const NEW_PASSWORD = "otra-clave-nueva-123";
const APP_URL = "https://finanzas.example.app";

function tokenOf(url: string): string {
  return new URL(url).searchParams.get("token")!;
}

describe("recuperación de contraseña por email", () => {
  it("sin cuenta no crea nada (quien llama responde igual)", async () => {
    expect(await createPasswordResetLink("nadie@example.com", APP_URL)).toBeNull();
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("guarda solo el hash del token y arma el enlace con la URL pública", async () => {
    const { id } = await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const link = await createPasswordResetLink("ANA@example.com", APP_URL);
    expect(link).toMatchObject({ to: "ana@example.com", name: "Ana" });
    expect(link!.url.startsWith(`${APP_URL}/restablecer?token=`)).toBe(true);
    const token = tokenOf(link!.url);
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: id } });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toContain(token);

    const email = passwordResetEmail(link!);
    expect(email.to).toBe("ana@example.com");
    expect(email.text).toContain(link!.url);
    expect(email.html).toContain("Elegir una contraseña nueva");
  });

  it("cambia la contraseña, cierra las sesiones y el enlace sirve una sola vez", async () => {
    const { id } = await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const session = await createSession(id, "vitest");
    const token = tokenOf((await createPasswordResetLink("ana@example.com", APP_URL))!.url);

    expect(await confirmPasswordReset(token, NEW_PASSWORD)).toEqual({ id, name: "Ana" });
    expect(await authenticate("ana@example.com", NEW_PASSWORD)).not.toBeNull();
    expect(await authenticate("ana@example.com", PASSWORD)).toBeNull();
    expect(await validateSessionToken(session)).toBeNull();

    await expect(confirmPasswordReset(token, "una-tercera-clave")).rejects.toMatchObject({ code: "RESET_LINK_INVALID", status: 400 });
  });

  it("dos usos simultáneos del mismo enlace: solo uno gana", async () => {
    await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const token = tokenOf((await createPasswordResetLink("ana@example.com", APP_URL))!.url);
    const results = await Promise.allSettled([confirmPasswordReset(token, NEW_PASSWORD), confirmPasswordReset(token, "una-tercera-clave")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("rechaza enlaces vencidos, inventados y anulados por uno más nuevo", async () => {
    await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const past = new Date(Date.now() - RESET_TOKEN_TTL_MS - 60_000);
    const expired = tokenOf((await createPasswordResetLink("ana@example.com", APP_URL, past))!.url);
    await expect(confirmPasswordReset(expired, NEW_PASSWORD)).rejects.toMatchObject({ code: "RESET_LINK_INVALID" });

    await expect(confirmPasswordReset("x".repeat(43), NEW_PASSWORD)).rejects.toMatchObject({ code: "RESET_LINK_INVALID" });

    const first = tokenOf((await createPasswordResetLink("ana@example.com", APP_URL))!.url);
    const second = tokenOf((await createPasswordResetLink("ana@example.com", APP_URL))!.url);
    await expect(confirmPasswordReset(first, NEW_PASSWORD)).rejects.toMatchObject({ code: "RESET_LINK_INVALID" });
    await expect(confirmPasswordReset(second, NEW_PASSWORD)).resolves.toMatchObject({ name: "Ana" });
    expect(await authenticate("ana@example.com", PASSWORD)).toBeNull();
  });

  it("el enlace de una usuaria no cambia la contraseña de otra", async () => {
    await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const { id: bea } = await createUser({ email: "bea@example.com", name: "Bea", password: PASSWORD });
    const token = tokenOf((await createPasswordResetLink("ana@example.com", APP_URL))!.url);
    const user = await confirmPasswordReset(token, NEW_PASSWORD);
    expect(user.id).not.toBe(bea);
    expect(await authenticate("bea@example.com", PASSWORD)).not.toBeNull();
  });
});

describe("registro público", () => {
  it("cada cuenta arranca con sus propias categorías y comercios, sin compartir nada", async () => {
    const { id: ana } = await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const { id: bea } = await createUser({ email: "bea@example.com", name: "Bea", password: PASSWORD });
    const anaCategories = await prisma.category.findMany({ where: { userId: ana }, select: { id: true } });
    const beaCategories = await prisma.category.findMany({ where: { userId: bea }, select: { id: true } });
    expect(anaCategories.length).toBe(beaCategories.length);
    const shared = anaCategories.filter((category) => beaCategories.some((other) => other.id === category.id));
    expect(shared).toHaveLength(0);
    const users = await prisma.user.findMany({ where: { id: { in: [ana, bea] } }, select: { onboardedAt: true } });
    expect(users.every((user) => user.onboardedAt === null)).toBe(true);
  });
});
