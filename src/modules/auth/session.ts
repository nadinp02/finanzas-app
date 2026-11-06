import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fromDbDate, type LocalDate } from "@/lib/dates";
import { prisma } from "@/server/db";

const DAY_MS = 86_400_000;
/** La sesión vence tras 60 días sin uso; se renueva cuando le quedan menos de 30. */
const SESSION_TTL_MS = 60 * DAY_MS;
const RENEW_BEFORE_MS = 30 * DAY_MS;

// `__Host-` exige HTTPS; en desarrollo (http://localhost) se usa un nombre simple.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cc_session" : "cc_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
  trackingStartDate: LocalDate | null;
  onboarded: boolean;
  defaultAccountId: string | null;
  voiceAutoSave: boolean;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // La validez real la decide la base; la cookie solo debe durar al menos lo mismo.
    maxAge: 400 * 24 * 60 * 60,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });
  return token;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  currency: true,
  trackingStartDate: true,
  onboardedAt: true,
  defaultAccountId: true,
  voiceAutoSave: true,
} as const;

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: { select: userSelect } } });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  if (session.expiresAt.getTime() - now < RENEW_BEFORE_MS) {
    await prisma.session.update({
      where: { id },
      data: { expiresAt: new Date(now + SESSION_TTL_MS), lastSeenAt: new Date(now) },
    });
  }

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    currency: user.currency,
    trackingStartDate: user.trackingStartDate ? fromDbDate(user.trackingStartDate) : null,
    onboarded: user.onboardedAt !== null,
    defaultAccountId: user.defaultAccountId,
    voiceAutoSave: user.voiceAutoSave,
  };
}

export async function invalidateSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
