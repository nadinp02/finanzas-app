import "server-only";
import fs from "node:fs/promises";
import { env, type Env } from "./env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {
  constructor(
    readonly provider: string,
    readonly status?: number,
  ) {
    super(`No se pudo enviar el email (${provider}${status ? `, HTTP ${status}` : ""}).`);
  }
}

/** "Cuentas Claras <tu@gmail.com>" → { name, email }. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(from);
  if (match) return { name: match[1] || undefined, email: match[2]! };
  return { email: from.trim() };
}

const TIMEOUT_MS = 10_000;

async function post(provider: string, url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new EmailError(provider);
  }
  if (!response.ok) throw new EmailError(provider, response.status);
}

/** Brevo: permite verificar solo la dirección del remitente (sirve con un dominio *.vercel.app). */
export class BrevoSender implements EmailSender {
  readonly name = "brevo";
  constructor(private readonly options: { apiKey: string; from: string }) {}

  async send(message: EmailMessage): Promise<void> {
    await post("brevo", "https://api.brevo.com/v3/smtp/email", { "api-key": this.options.apiKey }, {
      sender: parseSender(this.options.from),
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    });
  }
}

/** Resend: sin un dominio propio verificado solo entrega a la dirección de la cuenta de Resend. */
export class ResendSender implements EmailSender {
  readonly name = "resend";
  constructor(private readonly options: { apiKey: string; from: string }) {}

  async send(message: EmailMessage): Promise<void> {
    await post("resend", "https://api.resend.com/emails", { authorization: `Bearer ${this.options.apiKey}` }, {
      from: this.options.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/** Pruebas: agrega cada email como una línea JSON. */
export class OutboxFileSender implements EmailSender {
  readonly name = "outbox";
  constructor(private readonly file: string) {}

  async send(message: EmailMessage): Promise<void> {
    await fs.appendFile(this.file, `${JSON.stringify({ ...message, sentAt: new Date().toISOString() })}\n`);
  }
}

/**
 * Sin proveedor configurado. En desarrollo muestra el email en la consola (para usar el enlace); en
 * producción solo registra que no se pudo enviar, sin el contenido.
 */
export class ConsoleSender implements EmailSender {
  readonly name = "console";
  constructor(private readonly production: boolean) {}

  async send(message: EmailMessage): Promise<void> {
    if (this.production) {
      console.error(JSON.stringify({ level: "error", event: "email_not_configured", message: "Falta BREVO_API_KEY o RESEND_API_KEY y EMAIL_FROM: no se envió el email." }));
      return;
    }
    console.info(`\n── Email (sin proveedor configurado, solo desarrollo) ──\nPara: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n`);
  }
}

export type EmailConfig = Pick<Env, "NODE_ENV" | "EMAIL_FROM" | "BREVO_API_KEY" | "RESEND_API_KEY" | "EMAIL_OUTBOX_FILE">;

export function selectEmailSender(config: EmailConfig): EmailSender {
  if (config.EMAIL_OUTBOX_FILE) return new OutboxFileSender(config.EMAIL_OUTBOX_FILE);
  if (config.EMAIL_FROM && config.BREVO_API_KEY) return new BrevoSender({ apiKey: config.BREVO_API_KEY, from: config.EMAIL_FROM });
  if (config.EMAIL_FROM && config.RESEND_API_KEY) return new ResendSender({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM });
  return new ConsoleSender(config.NODE_ENV === "production");
}

export function emailSender(): EmailSender {
  return selectEmailSender(env());
}

/** URL pública para armar enlaces. `null` si no se puede saber de forma confiable. */
export function publicAppUrl(config: Pick<Env, "NODE_ENV" | "APP_URL" | "VERCEL_PROJECT_PRODUCTION_URL"> = env(), requestOrigin?: string): string | null {
  if (config.APP_URL) return config.APP_URL.replace(/\/+$/, "");
  if (config.VERCEL_PROJECT_PRODUCTION_URL) return `https://${config.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, "")}`;
  // En desarrollo, el origen de la solicitud (localhost). En producción no se confía en Host.
  if (config.NODE_ENV !== "production" && requestOrigin) return requestOrigin;
  return null;
}
