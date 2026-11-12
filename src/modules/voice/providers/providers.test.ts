/**
 * Pruebas de contrato de los adaptadores: forma exacta de cada solicitud y manejo de respuestas y
 * errores, con `fetch` y el cliente del SDK simulados. No prueban la conexión real (eso lo hace
 * `npm run voice:check` con claves configuradas).
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { testContext } from "../test-context";
import { AnthropicInterpreter } from "./anthropic-interpreter";
import { selectVoiceProviders, type ProviderConfig } from "./index";
import { FakeTranscriber, LocalInterpreter } from "./local";
import { OpenAIInterpreter } from "./openai-interpreter";
import { OpenAITranscriber, sanitizeKeywords } from "./openai-transcriber";
import { outputJsonSchema, SYSTEM_PROMPT } from "./prompt";
import { VoiceProviderError } from "./types";

const ctx = testContext();
const TRANSCRIPT = "Nafta cincuenta mil, supermercado treinta y dos mil";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function rejection(promise: Promise<unknown>): Promise<VoiceProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof VoiceProviderError) return error;
    throw error;
  }
  throw new Error("Se esperaba un error");
}

describe("OpenAITranscriber (gpt-transcribe)", () => {
  it("envía el audio como multipart con idioma, palabras clave y contexto", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ text: "Nafta $50.000" }));
    const transcriber = new OpenAITranscriber({ apiKey: "sk-prueba", model: "gpt-transcribe", fetch: fetchMock });
    const audio = new Blob([new Uint8Array(10)], { type: "audio/mp4" });
    const result = await transcriber.transcribe({ audio, mimeType: "audio/mp4", durationMs: 2000, keywords: ["Farmacity", "Coto<script>", "Coto<script>", "a\nb"] });

    expect(result).toEqual({ text: "Nafta $50.000", model: "gpt-transcribe" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-prueba");
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("gpt-transcribe");
    expect(form.getAll("languages[]")).toEqual(["es"]);
    expect(form.getAll("keywords[]")).toEqual(["Farmacity", "Coto script", "a b"]);
    expect(form.get("response_format")).toBe("json");
    expect(String(form.get("prompt"))).toContain("español de Argentina");
    const file = form.get("file") as File;
    expect(file.name).toBe("dictado.mp4");
    expect(file.type).toBe("audio/mp4");
    expect(file.size).toBe(10);
  });

  it("traduce los errores sin exponer datos", async () => {
    const audio = new Blob(["x"], { type: "audio/webm" });
    const call = (impl: () => Promise<Response>) =>
      rejection(new OpenAITranscriber({ apiKey: "k", model: "gpt-transcribe", fetch: vi.fn(impl) as typeof fetch }).transcribe({ audio, mimeType: "audio/webm", durationMs: 1000, keywords: [] }));
    expect((await call(async () => jsonResponse({}, 401))).failure).toBe("auth");
    expect((await call(async () => jsonResponse({}, 429))).failure).toBe("rate_limit");
    expect((await call(async () => jsonResponse({}, 500))).failure).toBe("server");
    expect((await call(async () => jsonResponse({}, 400))).failure).toBe("bad_request");
    expect((await call(async () => jsonResponse({ nada: true }))).failure).toBe("invalid_response");
    expect((await call(async () => { throw new TypeError("fetch failed"); })).failure).toBe("network");
    expect((await call(async () => { throw new DOMException("t", "TimeoutError"); })).failure).toBe("timeout");
  });

  it("limita y limpia las palabras clave", () => {
    expect(sanitizeKeywords(Array.from({ length: 80 }, (_, i) => `Comercio ${i}`))).toHaveLength(50);
    expect(sanitizeKeywords(["", "  ", "x".repeat(61), "YPF"])).toEqual(["YPF"]);
  });
});

describe("OpenAIInterpreter (Responses API)", () => {
  const output = (items: unknown[]) => ({
    status: "completed",
    model: "gpt-6-luna",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ items }) }] }],
  });

  it("pide salida estructurada estricta con la lista cerrada de categorías", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(output([{ amount: "50000.00" }])));
    const interpreter = new OpenAIInterpreter({ apiKey: "sk-prueba", model: "gpt-6-luna", fetch: fetchMock });
    const result = await interpreter.interpret({ transcript: TRANSCRIPT, context: ctx });
    expect(result).toEqual({ items: [{ amount: "50000.00" }], model: "gpt-6-luna" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("gpt-6-luna");
    expect(body.store).toBe(false);
    expect(body.input[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(body.input[1].content).toContain(`<transcripcion>\n${TRANSCRIPT}\n</transcripcion>`);
    expect(body.input[1].content).toContain("Hoy es jueves 5 de noviembre de 2026 (2026-11-05).");
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "movimientos", strict: true });
    const item = body.text.format.schema.properties.items.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(Object.keys(item.properties));
    expect(item.properties.category.enum).toContain("Transporte › Combustible");
    expect(item.properties.category.enum).toContain(null);
  });

  it("rechazo, respuesta incompleta o JSON inválido son errores del proveedor", async () => {
    const call = (body: unknown, status = 200) =>
      rejection(new OpenAIInterpreter({ apiKey: "k", model: "m", fetch: vi.fn(async () => jsonResponse(body, status)) as typeof fetch }).interpret({ transcript: TRANSCRIPT, context: ctx }));
    expect((await call({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })).failure).toBe("refusal");
    expect((await call({ status: "incomplete", output: [] })).failure).toBe("invalid_response");
    expect((await call({ output: [{ type: "message", content: [{ type: "output_text", text: "{no json" }] }] })).failure).toBe("invalid_response");
    expect((await call({}, 401)).failure).toBe("auth");
  });

  it("el esquema JSON estricto marca todo como requerido", () => {
    const schema = outputJsonSchema([]) as { properties: { items: { items: { properties: { category: unknown } } } } };
    expect(schema.properties.items.items.properties.category).toEqual({ type: ["string", "null"] });
  });
});

describe("AnthropicInterpreter (Claude)", () => {
  function fakeClient(response: unknown) {
    const parse = vi.fn<(params: unknown) => Promise<unknown>>(async () => response);
    return { parse, client: { beta: { messages: { parse } } } as unknown as Pick<Anthropic, "beta"> };
  }

  it("usa salida estructurada con Zod, esfuerzo bajo y fallbacks del servidor", async () => {
    const items = [{ type: "EXPENSE", amount: "50000.00" }];
    const { parse, client } = fakeClient({ stop_reason: "end_turn", parsed_output: { items }, model: "claude-opus-5-5" });
    const interpreter = new AnthropicInterpreter({ apiKey: "k", model: "claude-opus-5-5", client });
    expect(await interpreter.interpret({ transcript: TRANSCRIPT, context: ctx })).toEqual({ items, model: "claude-opus-5-5" });

    const [params] = parse.mock.calls[0] as [Record<string, unknown>];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: expect.objectContaining({ type: "json_schema" }) },
    });
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("temperature");
    const messages = params.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toContain(`<transcripcion>\n${TRANSCRIPT}\n</transcripcion>`);
    expect(messages[0]!.content).toContain("- Transporte › Combustible");
    expect(messages[0]!.content).toContain("- Visa (tarjeta de crédito)");
  });

  it("rechazo, salida truncada o sin parsear son errores del proveedor", async () => {
    const call = (response: unknown) => rejection(new AnthropicInterpreter({ apiKey: "k", model: "m", client: fakeClient(response).client }).interpret({ transcript: TRANSCRIPT, context: ctx }));
    expect((await call({ stop_reason: "refusal", parsed_output: null })).failure).toBe("refusal");
    expect((await call({ stop_reason: "max_tokens", parsed_output: null })).failure).toBe("invalid_response");
    expect((await call({ stop_reason: "end_turn", parsed_output: null })).failure).toBe("invalid_response");
  });

  it("traduce los errores del SDK", async () => {
    const failing = (error: unknown) => {
      const parse = vi.fn(async () => {
        throw error;
      });
      return rejection(new AnthropicInterpreter({ apiKey: "k", model: "m", client: { beta: { messages: { parse } } } as unknown as Pick<Anthropic, "beta"> }).interpret({ transcript: TRANSCRIPT, context: ctx }));
    };
    expect((await failing(new Anthropic.APIConnectionError({ message: "x" }))).failure).toBe("network");
    expect((await failing(new Anthropic.APIConnectionTimeoutError())).failure).toBe("timeout");
    expect((await failing(new Error("formato"))).failure).toBe("invalid_response");
  });
});

describe("selección de proveedores", () => {
  const base: ProviderConfig = {
    OPENAI_API_KEY: undefined,
    OPENAI_TRANSCRIBE_MODEL: "gpt-transcribe",
    OPENAI_INTERPRETER_MODEL: "gpt-6-luna",
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_MODEL: "claude-opus-5-5",
    VOICE_INTERPRETER: "auto",
    VOICE_STT_PROVIDER: "openai",
    VOICE_FAKE_TRANSCRIPT: undefined,
  };

  it("sin claves: sin transcripción y con el intérprete local", () => {
    const { providers, warnings } = selectVoiceProviders(base);
    expect(providers.transcriber).toBeNull();
    expect(providers.interpreter).toBeInstanceOf(LocalInterpreter);
    expect(warnings).toEqual([]);
  });

  it("con claves: OpenAI transcribe y Claude interpreta", () => {
    const { providers } = selectVoiceProviders({ ...base, OPENAI_API_KEY: "sk", ANTHROPIC_API_KEY: "sk-ant" });
    expect(providers.transcriber).toBeInstanceOf(OpenAITranscriber);
    expect(providers.interpreter).toBeInstanceOf(AnthropicInterpreter);
    expect(providers.fallbackInterpreter).toBeInstanceOf(LocalInterpreter);
  });

  it("se puede cambiar el intérprete a OpenAI sin tocar el caso de uso", () => {
    const { providers } = selectVoiceProviders({ ...base, OPENAI_API_KEY: "sk", ANTHROPIC_API_KEY: "sk-ant", VOICE_INTERPRETER: "openai" });
    expect(providers.interpreter).toBeInstanceOf(OpenAIInterpreter);
  });

  it("un proveedor pedido sin su clave cae al local con aviso", () => {
    const { providers, warnings } = selectVoiceProviders({ ...base, VOICE_INTERPRETER: "anthropic" });
    expect(providers.interpreter).toBeInstanceOf(LocalInterpreter);
    expect(warnings).toHaveLength(1);
  });

  it("transcripción falsa solo si se pide explícitamente", () => {
    const { providers } = selectVoiceProviders({ ...base, VOICE_STT_PROVIDER: "fake", VOICE_FAKE_TRANSCRIPT: TRANSCRIPT });
    expect(providers.transcriber).toBeInstanceOf(FakeTranscriber);
  });
});
