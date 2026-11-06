import "server-only";
import { createHash } from "node:crypto";
import { errors } from "@/lib/errors";
import { prisma } from "./db";

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  loginByIp: { name: "login-ip", limit: 20, windowSeconds: 15 * 60 },
  loginByEmail: { name: "login-email", limit: 8, windowSeconds: 15 * 60 },
  voice: { name: "voice", limit: 30, windowSeconds: 10 * 60 },
  write: { name: "write", limit: 240, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

/** Las IPs y emails no se guardan en claro en la tabla de contadores. */
export function rateLimitSubject(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * Ventana fija atómica en PostgreSQL: funciona igual con una o muchas instancias serverless.
 * Lanza RATE_LIMITED si se superó el límite.
 */
export async function consumeRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const windowMs = rule.windowSeconds * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `${rule.name}:${subject}`;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
    RETURNING count`;
  if ((rows[0]?.count ?? 1) > rule.limit) {
    throw errors.rateLimited(Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
  }
}

export async function purgeRateLimitBuckets(olderThan: Date): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: olderThan } } });
  return count;
}
