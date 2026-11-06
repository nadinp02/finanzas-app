import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError, errors, type FieldErrors } from "@/lib/errors";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "@/modules/auth/session";
import { consumeRateLimit, RATE_LIMITS, type RateLimitRule } from "./rate-limit";

type RouteParams = Record<string, string>;

interface RouteContext<P extends RouteParams> {
  params: Promise<P>;
}

export interface PublicRouteArgs<P extends RouteParams> {
  request: NextRequest;
  params: P;
}

export interface AuthedRouteArgs<P extends RouteParams> extends PublicRouteArgs<P> {
  user: SessionUser;
}

interface RouteOptions {
  /** Por defecto, las mutaciones usan el límite general de escritura. */
  rateLimit?: RateLimitRule | false;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Defensa CSRF adicional a SameSite=Lax: las mutaciones deben venir del mismo origen.
 * `Sec-Fetch-Site` lo envían todos los navegadores modernos; `Origin`, cualquier fetch con cuerpo.
 */
function assertSameOrigin(request: NextRequest): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw errors.forbidden();
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw errors.forbidden();
    }
    if (originHost !== host) throw errors.forbidden();
  }
}

export async function getRequestUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? validateSessionToken(token) : null;
}

function zodFieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function errorResponse(error: unknown): NextResponse {
  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = errors.validation(zodFieldErrors(error));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    appError = errors.conflict("DUPLICATE", "Ya existe un registro con esos datos.");
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    appError = errors.notFound();
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    appError = errors.conflict("IN_USE", "No se puede completar porque hay datos relacionados.");
  } else {
    // Sin mensajes de error crudos: pueden contener datos financieros de la consulta.
    const name = error instanceof Error ? error.name : typeof error;
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error(JSON.stringify({ level: "error", event: "unhandled_route_error", name, code }));
    if (error instanceof Error && error.stack) console.error(error.stack.split("\n").slice(1, 6).join("\n"));
    appError = new AppError("INTERNAL_ERROR", "Ocurrió un error inesperado. Probá de nuevo.", 500);
  }
  const response = NextResponse.json(appError.toBody(), { status: appError.status });
  const retryAfter = (appError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
  if (retryAfter) response.headers.set("Retry-After", String(retryAfter));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function finalize(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function publicRoute<P extends RouteParams = RouteParams>(
  handler: (args: PublicRouteArgs<P>) => Promise<Response>,
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      if (MUTATING_METHODS.has(request.method)) assertSameOrigin(request);
      return finalize(await handler({ request, params: await context.params }));
    } catch (error) {
      // Errores internos de Next (acceso a datos de request durante el prerender, redirect, notFound).
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}

export function authedRoute<P extends RouteParams = RouteParams>(
  handler: (args: AuthedRouteArgs<P>) => Promise<Response>,
  options: RouteOptions = {},
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      const mutating = MUTATING_METHODS.has(request.method);
      if (mutating) assertSameOrigin(request);
      const user = await getRequestUser(request);
      if (!user) throw errors.unauthorized();
      const rule = options.rateLimit ?? (mutating ? RATE_LIMITS.write : false);
      if (rule) await consumeRateLimit(rule, user.id);
      return finalize(await handler({ request, params: await context.params, user }));
    } catch (error) {
      // Errores internos de Next (acceso a datos de request durante el prerender, redirect, notFound).
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}

const DEFAULT_JSON_LIMIT = 64 * 1024;

/** Lee y valida un cuerpo JSON con límite de tamaño. */
export async function parseJson<T>(request: NextRequest, schema: ZodType<T>, maxBytes = DEFAULT_JSON_LIMIT): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw errors.payloadTooLarge();
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw errors.payloadTooLarge();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw errors.badRequest("El cuerpo de la solicitud no es JSON válido.");
  }
  return schema.parse(data);
}

/** Valida los parámetros de búsqueda de un GET. */
export function parseSearchParams<T>(request: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}
