import { describe, expect, it } from "vitest";
import { authenticate, changePassword, createUser, resetPassword } from "@/modules/auth/service";
import { createSession, invalidateSession, validateSessionToken } from "@/modules/auth/session";
import { prisma } from "@/server/db";
import { consumeRateLimit } from "@/server/rate-limit";

const PASSWORD = "una-clave-segura";

describe("alta y autenticación", () => {
  it("crea la usuaria con contraseña hasheada y datos iniciales", async () => {
    const { id } = await createUser({ email: "Ana@Example.com", name: "Ana", password: PASSWORD });
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.email).toBe("ana@example.com");
    expect(user.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(await prisma.category.count({ where: { userId: id } })).toBeGreaterThan(30);
    expect(await prisma.merchant.count({ where: { userId: id } })).toBeGreaterThan(20);
  });

  it("autentica con la contraseña correcta y rechaza la incorrecta", async () => {
    await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    expect(await authenticate("ANA@example.com", PASSWORD)).toMatchObject({ name: "Ana" });
    expect(await authenticate("ana@example.com", "otra-clave-cualquiera")).toBeNull();
    expect(await authenticate("nadie@example.com", PASSWORD)).toBeNull();
  });

  it("rechaza emails repetidos y contraseñas cortas", async () => {
    await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    await expect(createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD })).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
    await expect(createUser({ email: "b@example.com", name: "B", password: "corta" })).rejects.toThrow();
  });

  it("cambiar o restablecer la contraseña cierra las sesiones", async () => {
    const { id } = await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const token = await createSession(id, "vitest");
    await changePassword(id, PASSWORD, "nueva-clave-segura");
    expect(await validateSessionToken(token)).toBeNull();
    expect(await authenticate("ana@example.com", "nueva-clave-segura")).not.toBeNull();
    await expect(changePassword(id, "incorrecta-123", "otra-clave-segura")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await resetPassword("ana@example.com", "recuperada-segura");
    expect(await authenticate("ana@example.com", "recuperada-segura")).not.toBeNull();
  });
});

describe("sesiones", () => {
  it("guarda solo el hash del token y valida, renueva y revoca", async () => {
    const { id } = await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const token = await createSession(id, "vitest");
    const stored = await prisma.session.findFirstOrThrow({ where: { userId: id } });
    expect(stored.id).not.toBe(token);
    expect(stored.id).toHaveLength(64);

    expect(await validateSessionToken(token)).toMatchObject({ id, email: "ana@example.com", onboarded: false });
    expect(await validateSessionToken("token-invalido")).toBeNull();

    // A punto de vencer: se renueva por 60 días más.
    await prisma.session.update({ where: { id: stored.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
    await validateSessionToken(token);
    const renewed = await prisma.session.findUniqueOrThrow({ where: { id: stored.id } });
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);

    await invalidateSession(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("descarta sesiones vencidas", async () => {
    const { id } = await createUser({ email: "ana@example.com", name: "Ana", password: PASSWORD });
    const token = await createSession(id, null);
    await prisma.session.updateMany({ where: { userId: id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
  });
});

describe("rate limiting", () => {
  it("corta al superar el límite de la ventana", async () => {
    const rule = { name: "test", limit: 3, windowSeconds: 60 };
    for (let attempt = 0; attempt < 3; attempt += 1) await consumeRateLimit(rule, "sujeto");
    await expect(consumeRateLimit(rule, "sujeto")).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    await expect(consumeRateLimit(rule, "otro")).resolves.toBeUndefined();
  });
});
