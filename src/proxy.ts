import { NextResponse, type NextRequest } from "next/server";

// Chequeo optimista: solo mira si hay cookie para redirigir antes de renderizar. La validación real
// de la sesión ocurre en la capa de datos (requireUser y los Route Handlers).
const SESSION_COOKIES = ["__Host-cc_session", "cc_session"];
const PUBLIC_PATHS = new Set(["/login", "/~offline"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Todo menos la API (responde 401 por su cuenta), estáticos, íconos, manifest y service worker.
    "/((?!api|_next/static|_next/image|icons/|favicon.ico|apple-icon|icon|manifest.webmanifest|sw.js|swe-worker|robots.txt).*)",
  ],
};
