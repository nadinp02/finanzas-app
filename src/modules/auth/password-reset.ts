import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { APP_NAME } from "@/lib/app";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import type { EmailMessage } from "@/server/email";
import { setPassword } from "./service";

/** Vigencia del enlace de recuperación. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PasswordResetLink {
  to: string;
  name: string;
  url: string;
}

/**
 * Crea un enlace de recuperación para el email, si hay una cuenta. Devuelve `null` si no existe: quien
 * llama responde igual en los dos casos para no revelar qué emails tienen cuenta. Un enlace nuevo anula
 * los anteriores sin usar.
 */
export async function createPasswordResetLink(email: string, appUrl: string, now = new Date()): Promise<PasswordResetLink | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, name: true, email: true } });
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS) },
    }),
  ]);
  await audit({ userId: user.id, action: "PASSWORD_RESET_REQUESTED" });
  return { to: user.email, name: user.name, url: `${appUrl}/restablecer?token=${encodeURIComponent(token)}` };
}

const INVALID_LINK = "El enlace no es válido o ya venció. Pedí uno nuevo.";

/**
 * Usa el enlace: lo marca como usado (una sola vez, aunque lleguen dos solicitudes a la vez), cambia la
 * contraseña y cierra todas las sesiones. Devuelve la usuaria para iniciarle sesión.
 */
export async function confirmPasswordReset(token: string, newPassword: string, now = new Date()): Promise<{ id: string; name: string }> {
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true } });
  if (!record) throw new AppError("RESET_LINK_INVALID", INVALID_LINK, 400);
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) throw new AppError("RESET_LINK_INVALID", INVALID_LINK, 400);

  await setPassword(record.userId, newPassword);
  await prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
  return prisma.user.findUniqueOrThrow({ where: { id: record.userId }, select: { id: true, name: true } });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function passwordResetEmail(link: PasswordResetLink): EmailMessage {
  const minutes = RESET_TOKEN_TTL_MS / 60_000;
  const text = [
    `Hola ${link.name}:`,
    "",
    `Pediste restablecer tu contraseña de ${APP_NAME}. Entrá a este enlace para elegir una nueva:`,
    "",
    link.url,
    "",
    `El enlace vence en ${minutes} minutos y sirve una sola vez.`,
    "Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.",
  ].join("\n");
  const url = escapeHtml(link.url);
  const html = `<!doctype html><html lang="es"><body style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:480px;margin:0 auto;padding:24px">
<p>Hola ${escapeHtml(link.name)}:</p>
<p>Pediste restablecer tu contraseña de ${escapeHtml(APP_NAME)}.</p>
<p><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Elegir una contraseña nueva</a></p>
<p style="font-size:14px;color:#555">O copiá este enlace: <br><a href="${url}" style="color:#555;word-break:break-all">${url}</a></p>
<p style="font-size:14px;color:#555">Vence en ${minutes} minutos y sirve una sola vez. Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.</p>
</body></html>`;
  return { to: link.to, subject: `Restablecer tu contraseña de ${APP_NAME}`, text, html };
}
