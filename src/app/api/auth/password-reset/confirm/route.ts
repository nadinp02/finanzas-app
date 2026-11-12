import { confirmPasswordReset } from "@/modules/auth/password-reset";
import { passwordResetConfirmSchema } from "@/modules/auth/schema";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";
import { clientIp, json, parseJson, publicRoute } from "@/server/http";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject } from "@/server/rate-limit";

/** Usa el enlace del email: cambia la contraseña, cierra las demás sesiones e inicia una nueva. */
export const POST = publicRoute(async ({ request }) => {
  const { token, password } = await parseJson(request, passwordResetConfirmSchema);
  await consumeRateLimit(RATE_LIMITS.resetConfirmByIp, rateLimitSubject(clientIp(request)));
  const user = await confirmPasswordReset(token, password);
  const session = await createSession(user.id, request.headers.get("user-agent"));
  const response = json({ user: { name: user.name } });
  response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return response;
});
