import { after } from "next/server";
import { createPasswordResetLink, passwordResetEmail } from "@/modules/auth/password-reset";
import { passwordResetRequestSchema } from "@/modules/auth/schema";
import { emailSender, EmailError, publicAppUrl } from "@/server/email";
import { clientIp, json, parseJson, publicRoute } from "@/server/http";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject } from "@/server/rate-limit";

export const maxDuration = 30;

/**
 * Pide un enlace de recuperación. Responde lo mismo exista o no la cuenta, y el email se envía después
 * de responder (`after`) para que el tiempo de respuesta tampoco lo revele.
 */
export const POST = publicRoute(async ({ request }) => {
  const { email } = await parseJson(request, passwordResetRequestSchema);
  await consumeRateLimit(RATE_LIMITS.resetRequestByIp, rateLimitSubject(clientIp(request)));
  await consumeRateLimit(RATE_LIMITS.resetRequestByEmail, rateLimitSubject(email));

  const appUrl = publicAppUrl(undefined, request.nextUrl.origin);
  if (!appUrl) {
    console.error(JSON.stringify({ level: "error", event: "password_reset", message: "Falta APP_URL: no se puede armar el enlace." }));
  } else {
    const link = await createPasswordResetLink(email, appUrl);
    if (link) {
      after(async () => {
        try {
          await emailSender().send(passwordResetEmail(link));
        } catch (error) {
          const detail = error instanceof EmailError ? { provider: error.provider, status: error.status } : {};
          console.error(JSON.stringify({ level: "error", event: "password_reset_email_failed", ...detail }));
        }
      });
    }
  }
  return json({ ok: true });
});
