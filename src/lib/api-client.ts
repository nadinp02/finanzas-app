import { isApiErrorBody, type FieldErrors } from "./errors";

/** Error de negocio o validación devuelto por la API. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fields?: FieldErrors,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** No se pudo hablar con el servidor (sin conexión, DNS, servidor caído). Es reintentable. */
export class NetworkError extends Error {
  constructor() {
    super("No hay conexión con el servidor.");
    this.name = "NetworkError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, { method = "GET", body, signal }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NetworkError();
  }
  return readResponse<T>(response);
}

export async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Solo una sesión vencida lleva al login; otros 401 (credenciales incorrectas al ingresar) se
    // muestran en el formulario que los causó.
    if (isApiErrorBody(data) && data.error.code === "UNAUTHORIZED" && typeof window !== "undefined") {
      // Navegación completa a propósito: al vencer la sesión se descarta todo el estado del cliente.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    if (isApiErrorBody(data)) {
      const { code, message, fields, details } = data.error;
      throw new ApiError(code, message, response.status, fields, details);
    }
    // Un 5xx sin cuerpo JSON suele ser un proxy o el hosting caído: se trata como red.
    if (response.status >= 500) throw new NetworkError();
    throw new ApiError("HTTP_ERROR", "Ocurrió un error inesperado.", response.status);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return "Ocurrió un error inesperado. Probá de nuevo.";
}
