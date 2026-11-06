import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "@/modules/auth/session";

/**
 * Capa de acceso a la sesión para Server Components. Memoizada por request: varias lecturas en la
 * misma página consultan la base una sola vez. Debe llamarse dentro de un <Suspense>.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? validateSessionToken(token) : null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Usuaria autenticada que ya completó la configuración inicial. */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.onboarded) redirect("/bienvenida");
  return user;
}
