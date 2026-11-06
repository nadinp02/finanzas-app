import { NextResponse } from "next/server";
import { invalidateSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";
import { publicRoute } from "@/server/http";

export const POST = publicRoute(async ({ request }) => {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
});
