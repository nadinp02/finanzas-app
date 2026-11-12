import { registerSchema } from "@/modules/auth/schema";
import { createUser } from "@/modules/auth/service";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";
import { clientIp, json, parseJson, publicRoute } from "@/server/http";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject } from "@/server/rate-limit";

/** Registro público: crea la cuenta con sus categorías iniciales e inicia sesión (sigue la bienvenida). */
export const POST = publicRoute(async ({ request }) => {
  const input = await parseJson(request, registerSchema);
  await consumeRateLimit(RATE_LIMITS.signupByIp, rateLimitSubject(clientIp(request)));
  const user = await createUser(input);
  const token = await createSession(user.id, request.headers.get("user-agent"));
  const response = json({ user: { name: input.name } }, 201);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
});
