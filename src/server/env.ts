import "server-only";
import { z } from "zod";

// Un valor vacío en .env ("OPENAI_API_KEY=") equivale a no configurado.
const optionalText = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string({ error: "Falta DATABASE_URL." })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL debe ser una URL de PostgreSQL."),
  OPENAI_API_KEY: optionalText,
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-transcribe"),
  ANTHROPIC_API_KEY: optionalText,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  /** Modelo de OpenAI para interpretar cuando `VOICE_INTERPRETER=openai`. */
  OPENAI_INTERPRETER_MODEL: z.string().default("gpt-6-luna"),
  /**
   * Quién interpreta lo dictado. "auto": Claude si hay ANTHROPIC_API_KEY; si no, el intérprete local
   * por reglas (siempre pide revisión).
   */
  VOICE_INTERPRETER: z.enum(["auto", "anthropic", "openai", "local"]).default("auto"),
  /** "fake" solo para pruebas automatizadas: devuelve VOICE_FAKE_TRANSCRIPT sin llamar a OpenAI. */
  VOICE_STT_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
  VOICE_FAKE_TRANSCRIPT: optionalText,
  CRON_SECRET: optionalText,
  /**
   * URL pública de la app para los enlaces de los emails (https://mi-app.vercel.app). En Vercel, si
   * falta, se usa VERCEL_PROJECT_PRODUCTION_URL. Nunca se toma del encabezado Host de la solicitud.
   */
  APP_URL: optionalText,
  VERCEL_PROJECT_PRODUCTION_URL: optionalText,
  /** Remitente de los emails: "Cuentas Claras <tu@gmail.com>". Con Brevo, una dirección verificada. */
  EMAIL_FROM: optionalText,
  /** Envío de emails con Brevo (gratis, sin dominio propio) o Resend (requiere dominio verificado). */
  BREVO_API_KEY: optionalText,
  RESEND_API_KEY: optionalText,
  /** Solo pruebas automatizadas: los emails se agregan a este archivo (una línea JSON) en vez de enviarse. */
  EMAIL_OUTBOX_FILE: optionalText,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Se valida en el primer uso y no al importar, para que el build no dependa de secretos. */
export function env(): Env {
  if (!cached) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      throw new Error(`Configuración inválida:\n${issues.join("\n")}`);
    }
    cached = result.data;
  }
  return cached;
}
