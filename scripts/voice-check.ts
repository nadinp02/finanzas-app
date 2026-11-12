/**
 * Prueba los proveedores de voz **reales** configurados en .env, sin base de datos ni sesión.
 *
 *   npm run voice:check                                  # interpreta una frase de ejemplo
 *   npm run voice:check -- --text "Farmacity 69.500 con la visa"
 *   npm run voice:check -- --audio ./grabacion.m4a       # transcribe y después interpreta
 *
 * Muestra qué proveedor se usó, la transcripción, lo que devolvió el modelo y el resultado de la
 * validación determinística. Cada ejecución consume créditos de OpenAI o Anthropic.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { todayIn } from "@/lib/dates";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_MERCHANTS } from "@/modules/categories/defaults";
import { selectVoiceProviders } from "@/modules/voice/providers";
import { categoryRefs, validateInterpretation, type VoiceContext } from "@/modules/voice/rules";
import { interpretedItemSchema } from "@/modules/voice/schema";
import { env } from "@/server/env";
import { loadEnv, reportError } from "./lib/cli";

loadEnv();

const { values } = parseArgs({ options: { text: { type: "string" }, audio: { type: "string" } } });

const MIME_BY_EXTENSION: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".webm": "audio/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/** Contexto de ejemplo: las categorías y comercios por defecto y cuentas típicas. */
function sampleContext(): VoiceContext {
  let counter = 0;
  const id = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  const raw: { id: string; name: string; kind: "EXPENSE" | "INCOME"; parentId: string | null }[] = [];
  for (const [kind, list] of [["EXPENSE", DEFAULT_EXPENSE_CATEGORIES], ["INCOME", DEFAULT_INCOME_CATEGORIES]] as const) {
    for (const root of list) {
      const rootId = id();
      raw.push({ id: rootId, name: root.name, kind, parentId: null });
      for (const child of root.children ?? []) raw.push({ id: id(), name: child.name, kind, parentId: rootId });
    }
  }
  const categories = categoryRefs(raw);
  const accounts = [
    { id: id(), name: "Efectivo", type: "CASH" as const },
    { id: id(), name: "Banco", type: "BANK" as const },
    { id: id(), name: "Mercado Pago", type: "DIGITAL_WALLET" as const },
    { id: id(), name: "Visa", type: "CREDIT_CARD" as const },
  ];
  return {
    today: todayIn(),
    trackingStartDate: null,
    accounts,
    categories,
    merchants: DEFAULT_MERCHANTS.map((m) => ({
      name: m.name,
      aliases: m.aliases ?? [],
      defaultCategoryId: categories.find((c) => c.path === m.category)?.id ?? null,
    })),
    defaultAccountId: accounts[0]!.id,
  };
}

try {
  const config = env();
  const { providers, warnings } = selectVoiceProviders(config);
  for (const warning of warnings) console.warn(`Aviso: ${warning}`);
  console.log(`Transcripción: ${providers.transcriber ? `${providers.transcriber.id} (${config.OPENAI_TRANSCRIBE_MODEL})` : "no configurada (falta OPENAI_API_KEY)"}`);
  console.log(`Interpretación: ${providers.interpreter.id}${providers.interpreter.local ? " (local por reglas: no usa servicios externos)" : ""}`);

  let transcript = values.text ?? "Nafta cincuenta mil, supermercado treinta y dos mil con la visa en tres cuotas";
  if (values.audio) {
    if (!providers.transcriber || providers.transcriber.id === "fake") throw new Error("Para --audio hace falta OPENAI_API_KEY (y VOICE_STT_PROVIDER distinto de fake).");
    const file = path.resolve(values.audio);
    const mimeType = MIME_BY_EXTENSION[path.extname(file).toLowerCase()];
    if (!mimeType) throw new Error(`Formato no soportado: ${path.extname(file)}`);
    const started = Date.now();
    const result = await providers.transcriber.transcribe({
      audio: new Blob([fs.readFileSync(file)], { type: mimeType }),
      mimeType,
      durationMs: 0,
      keywords: DEFAULT_MERCHANTS.map((m) => m.name),
    });
    transcript = result.text;
    console.log(`\nTranscripción (${Date.now() - started} ms, ${result.model}):\n  «${transcript}»`);
  } else {
    console.log(`\nTexto: «${transcript}»`);
  }

  const ctx = sampleContext();
  const started = Date.now();
  const interpretation = await providers.interpreter.interpret({ transcript, context: ctx });
  console.log(`\nRespuesta de ${interpretation.model} (${Date.now() - started} ms):`);
  console.log(JSON.stringify(interpretation.items, null, 2));

  const items = Array.isArray(interpretation.items) ? interpretation.items.map((item) => interpretedItemSchema.safeParse(item)) : [];
  const valid = items.flatMap((result) => (result.success ? [result.data] : []));
  if (valid.length !== items.length) console.log(`\n${items.length - valid.length} ítem(s) con formato inválido.`);
  const { drafts, notices } = validateInterpretation(transcript, valid, ctx, { local: providers.interpreter.local, newKey: () => crypto.randomUUID() });
  console.log("\nValidación determinística:");
  for (const draft of drafts) {
    const category = ctx.categories.find((c) => c.id === draft.categoryId)?.path ?? "—";
    const account = ctx.accounts.find((a) => a.id === draft.accountId)?.name ?? "—";
    console.log(`  • ${draft.type} ${draft.amount ?? "(sin importe)"} · ${draft.date} · ${category} · ${account}${draft.installments ? ` · ${draft.installments} cuotas` : ""}`);
    for (const issue of draft.issues) console.log(`      ⚠ ${issue.message}`);
    for (const note of draft.notes) console.log(`      · ${note}`);
  }
  for (const notice of notices) console.log(`  ⚠ ${notice}`);
} catch (error) {
  reportError(error);
}
