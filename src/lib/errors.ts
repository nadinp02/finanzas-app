/**
 * Errores de dominio con código estable y mensaje en español apto para mostrar.
 * Se comparten entre servidor (lanzan) y cliente (interpretan la respuesta de la API).
 */

export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: FieldErrors;
    details?: unknown;
  };
}

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly fields?: FieldErrors,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields && { fields: this.fields }),
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }
}

export const errors = {
  validation(fields: FieldErrors, message = "Revisá los datos ingresados.") {
    return new AppError("VALIDATION_ERROR", message, 422, fields);
  },
  badRequest(message = "La solicitud no es válida.") {
    return new AppError("BAD_REQUEST", message, 400);
  },
  unauthorized() {
    return new AppError("UNAUTHORIZED", "Tu sesión expiró. Volvé a ingresar.", 401);
  },
  forbidden(message = "No tenés permiso para hacer esto.") {
    return new AppError("FORBIDDEN", message, 403);
  },
  notFound(message = "No encontramos lo que buscabas.") {
    return new AppError("NOT_FOUND", message, 404);
  },
  conflict(code: string, message: string, details?: unknown) {
    return new AppError(code, message, 409, undefined, details);
  },
  rateLimited(retryAfterSeconds: number) {
    return new AppError(
      "RATE_LIMITED",
      "Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.",
      429,
      undefined,
      { retryAfterSeconds },
    );
  },
  payloadTooLarge(message = "El contenido enviado es demasiado grande.") {
    return new AppError("PAYLOAD_TOO_LARGE", message, 413);
  },
  unsupportedMediaType(message = "El formato enviado no es compatible.") {
    return new AppError("UNSUPPORTED_MEDIA_TYPE", message, 415);
  },
  provider(message: string) {
    return new AppError("PROVIDER_ERROR", message, 502);
  },
  providerNotConfigured(message: string) {
    return new AppError("PROVIDER_NOT_CONFIGURED", message, 503);
  },
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorBody).error?.code === "string"
  );
}
