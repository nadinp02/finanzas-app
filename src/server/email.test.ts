import { afterEach, describe, expect, it, vi } from "vitest";
import { BrevoSender, ConsoleSender, EmailError, OutboxFileSender, parseSender, publicAppUrl, ResendSender, selectEmailSender } from "./email";

const MESSAGE = { to: "ana@example.com", subject: "Asunto", text: "Texto", html: "<p>Texto</p>" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseSender", () => {
  it("separa nombre y dirección", () => {
    expect(parseSender("Cuentas Claras <hola@gmail.com>")).toEqual({ name: "Cuentas Claras", email: "hola@gmail.com" });
    expect(parseSender("hola@gmail.com")).toEqual({ email: "hola@gmail.com" });
    expect(parseSender("<hola@gmail.com>")).toEqual({ email: "hola@gmail.com" });
  });
});

describe("selectEmailSender", () => {
  const base = { NODE_ENV: "production" as const, EMAIL_FROM: "App <a@b.com>", BREVO_API_KEY: undefined, RESEND_API_KEY: undefined, EMAIL_OUTBOX_FILE: undefined };

  it("elige el proveedor configurado", () => {
    expect(selectEmailSender({ ...base, BREVO_API_KEY: "k" })).toBeInstanceOf(BrevoSender);
    expect(selectEmailSender({ ...base, RESEND_API_KEY: "k" })).toBeInstanceOf(ResendSender);
    expect(selectEmailSender({ ...base, BREVO_API_KEY: "k", EMAIL_OUTBOX_FILE: "out.jsonl" })).toBeInstanceOf(OutboxFileSender);
  });

  it("sin remitente o sin clave no envía", () => {
    expect(selectEmailSender({ ...base, EMAIL_FROM: undefined, BREVO_API_KEY: "k" })).toBeInstanceOf(ConsoleSender);
    expect(selectEmailSender(base)).toBeInstanceOf(ConsoleSender);
  });
});

describe("proveedores", () => {
  it("Brevo: remitente verificado, clave en el encabezado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await new BrevoSender({ apiKey: "clave", from: "App <a@b.com>" }).send(MESSAGE);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("clave");
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: "App", email: "a@b.com" },
      to: [{ email: "ana@example.com" }],
      subject: "Asunto",
      textContent: "Texto",
      htmlContent: "<p>Texto</p>",
    });
  });

  it("Resend: Bearer y remitente tal cual", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new ResendSender({ apiKey: "clave", from: "App <a@b.com>" }).send(MESSAGE);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer clave");
    expect(JSON.parse(init.body)).toMatchObject({ from: "App <a@b.com>", to: ["ana@example.com"] });
  });

  it("un rechazo del proveedor es un EmailError con el código HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(new BrevoSender({ apiKey: "mala", from: "a@b.com" }).send(MESSAGE)).rejects.toEqual(expect.objectContaining({ provider: "brevo", status: 401 }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(new ResendSender({ apiKey: "k", from: "a@b.com" }).send(MESSAGE)).rejects.toBeInstanceOf(EmailError);
  });

  it("sin proveedor: en desarrollo muestra el email; en producción no expone el contenido", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await new ConsoleSender(false).send(MESSAGE);
    expect(info.mock.calls[0]![0]).toContain("Texto");
    await new ConsoleSender(true).send(MESSAGE);
    expect(error.mock.calls[0]![0]).not.toContain("Texto");
  });
});

describe("publicAppUrl", () => {
  const prod = { NODE_ENV: "production" as const, APP_URL: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined };

  it("usa APP_URL, o el dominio de producción de Vercel", () => {
    expect(publicAppUrl({ ...prod, APP_URL: "https://mi.app/" })).toBe("https://mi.app");
    expect(publicAppUrl({ ...prod, VERCEL_PROJECT_PRODUCTION_URL: "finanzas.vercel.app" })).toBe("https://finanzas.vercel.app");
  });

  it("en producción no confía en el origen de la solicitud", () => {
    expect(publicAppUrl(prod, "https://atacante.example")).toBeNull();
    expect(publicAppUrl({ ...prod, NODE_ENV: "development" }, "http://localhost:3000")).toBe("http://localhost:3000");
  });
});
