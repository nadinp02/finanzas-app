import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { loginSchema } from "@/modules/auth/schema";
import { authenticate } from "@/modules/auth/service";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";
import { audit } from "@/server/audit";
import { json, parseJson, publicRoute } from "@/server/http";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject } from "@/server/rate-limit";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export const POST = publicRoute(async ({ request }) => {
  const { email, password } = await parseJson(request, loginSchema);
  await consumeRateLimit(RATE_LIMITS.loginByIp, rateLimitSubject(clientIp(request)));
  await consumeRateLimit(RATE_LIMITS.loginByEmail, rateLimitSubject(email));

  const user = await authenticate(email, password);
  if (!user) {
    await audit({ action: "LOGIN_FAILED" });
    throw new AppError("INVALID_CREDENTIALS", "Email o contraseña incorrectos.", 401);
  }

  const token = await createSession(user.id, request.headers.get("user-agent"));
  await audit({ userId: user.id, action: "LOGIN" });
  const response = json({ user: { name: user.name } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
});
