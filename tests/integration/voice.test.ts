import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { updateTransaction } from "@/modules/transactions/service";
import { FakeTranscriber, LocalInterpreter } from "@/modules/voice/providers/local";
import { VoiceProviderError, type Transcriber, type TransactionInterpreter, type VoiceProviders } from "@/modules/voice/providers/types";
import type { InterpretedItem, VoiceEntryDTO } from "@/modules/voice/schema";
import {
  confirmVoiceEntry,
  discardVoiceEntry,
  getVoiceEntry,
  listPendingVoiceEntries,
  processVoiceAudio,
  processVoiceText,
  undoVoiceEntry,
  type VoiceUser,
} from "@/modules/voice/service";
import { balance, pesos, record, setupFinance, TODAY } from "../support/finance";

const CASE_17 = "Nafta cincuenta mil, supermercado treinta y dos mil";
const AUDIO = new Blob([new Uint8Array(2048)], { type: "audio/webm;codecs=opus" });

/** Intérprete con forma de modelo (confianza alta): permite probar el guardado automático. */
function modelInterpreter(items: Partial<InterpretedItem>[]): TransactionInterpreter & { interpret: ReturnType<typeof vi.fn> } {
  return {
    id: "modelo-de-prueba",
    local: false,
    interpret: vi.fn(async () => ({
      items: items.map((item) => ({
        type: "EXPENSE",
        date: TODAY,
        description: null,
        merchant: null,
        category: null,
        accountMention: null,
        installments: null,
        confidence: 0.95,
        ...item,
      })),
      model: "modelo-de-prueba",
    })),
  };
}

function providers(overrides: Partial<VoiceProviders> = {}): VoiceProviders {
  return {
    transcriber: new FakeTranscriber(CASE_17),
    interpreter: new LocalInterpreter(),
    fallbackInterpreter: new LocalInterpreter(),
    ...overrides,
  };
}

const CASE_17_MODEL = [
  { amount: "50000.00", description: "Nafta", category: "Transporte › Combustible", quote: "Nafta cincuenta mil" },
  { amount: "32000.00", description: "Supermercado", category: "Supermercado", quote: "supermercado treinta y dos mil" },
];

async function voiceUser(autoSave = false) {
  const f = await setupFinance();
  await prisma.user.update({ where: { id: f.userId }, data: { defaultAccountId: f.bank, voiceAutoSave: autoSave } });
  const user: VoiceUser = {
    id: f.userId,
    timezone: "America/Argentina/Cordoba",
    trackingStartDate: "2026-10-01",
    defaultAccountId: f.bank,
    voiceAutoSave: autoSave,
  };
  return { f, user };
}

function confirmAll(entry: VoiceEntryDTO) {
  return {
    items: entry.drafts.map((draft) => ({
      key: draft.key,
      type: draft.type,
      amount: draft.amount!,
      date: draft.date,
      accountId: draft.accountId!,
      categoryId: draft.categoryId!,
      description: draft.description ?? undefined,
      merchantName: draft.merchantName ?? undefined,
    })),
  };
}

async function voiceTransactions(entryId: string) {
  return prisma.transaction.findMany({ where: { voiceEntryId: entryId }, orderBy: { createdAt: "asc" } });
}

describe("caso 17: voz con varios movimientos", () => {
  it("audio → dos borradores → revisión → dos movimientos; el audio no se guarda", async () => {
    const { f, user } = await voiceUser();
    const clientRequestId = randomUUID();
    const entry = await processVoiceAudio(user, { clientRequestId, durationMs: 3200, audio: AUDIO, mimeType: AUDIO.type }, providers(), TODAY);

    expect(entry).toMatchObject({ status: "NEEDS_REVIEW", inputType: "AUDIO", transcript: CASE_17, interpreter: { model: "local", local: true, fallback: false } });
    expect(entry.drafts.map((d) => [d.amount, d.description, d.accountId])).toEqual([
      ["50000.00", "Nafta", f.bank],
      ["32000.00", "Supermercado", f.bank],
    ]);
    expect(entry.drafts.every((d) => d.categoryId && d.issues.map((i) => i.code).join() === "LOCAL")).toBe(true);
    // Solo metadatos del audio: ni el archivo ni su contenido.
    const stored = await prisma.voiceEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stored).toMatchObject({ audioDurationMs: 3200, audioMimeType: "audio/webm", audioBytes: 2048, sttModel: "fake" });
    expect(JSON.stringify(stored)).not.toContain("AAAA");
    expect(await voiceTransactions(entry.id)).toHaveLength(0);

    const saved = await confirmVoiceEntry(user.id, entry.id, confirmAll(entry), TODAY);
    expect(saved).toMatchObject({ status: "SAVED", canUndo: true, autoSaved: false });
    expect(saved.transactions.map((t) => [t.amount, t.source, t.category?.name])).toEqual([
      ["50000.00", "VOICE", "Combustible"],
      ["32000.00", "VOICE", "Supermercado"],
    ]);
    expect(await balance(user.id, f.bank)).toBe(pesos(418_000));
  });

  it("reintentar la misma grabación devuelve la misma carga sin volver a procesar", async () => {
    const { user } = await voiceUser();
    const transcriber: Transcriber = { id: "fake", transcribe: vi.fn(async () => ({ text: CASE_17, model: "fake" })) };
    const input = { clientRequestId: randomUUID(), durationMs: 3000, audio: AUDIO, mimeType: AUDIO.type };
    const first = await processVoiceAudio(user, input, providers({ transcriber }), TODAY);
    const second = await processVoiceAudio(user, input, providers({ transcriber }), TODAY);
    expect(second.id).toBe(first.id);
    expect(second.drafts.map((d) => d.key)).toEqual(first.drafts.map((d) => d.key));
    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    expect(await prisma.voiceEntry.count({ where: { userId: user.id } })).toBe(1);
  });

  it("confirmar dos veces, o en paralelo, no duplica", async () => {
    const { user } = await voiceUser();
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers(), TODAY);
    const body = confirmAll(entry);
    const results = await Promise.all([
      confirmVoiceEntry(user.id, entry.id, body, TODAY),
      confirmVoiceEntry(user.id, entry.id, body, TODAY),
    ]);
    expect(results.map((r) => r.status)).toEqual(["SAVED", "SAVED"]);
    await confirmVoiceEntry(user.id, entry.id, body, TODAY);
    expect(await voiceTransactions(entry.id)).toHaveLength(2);
  });
});

describe("guardado automático y deshacer", () => {
  it("con todo claro y el guardado automático activado, guarda y permite deshacer", async () => {
    const { f, user } = await voiceUser(true);
    const interpreter = modelInterpreter(CASE_17_MODEL);
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers({ interpreter }), TODAY);
    expect(entry).toMatchObject({ status: "SAVED", autoSaved: true, canUndo: true, interpreter: { model: "modelo-de-prueba", local: false } });
    expect(entry.transactions).toHaveLength(2);
    expect(await balance(user.id, f.bank)).toBe(pesos(418_000));
    // El intérprete recibe la transcripción y el contexto de la usuaria.
    expect(interpreter.interpret).toHaveBeenCalledWith(expect.objectContaining({ transcript: CASE_17, context: expect.objectContaining({ today: TODAY }) }));

    const undone = await undoVoiceEntry(user.id, entry.id);
    expect(undone).toMatchObject({ status: "UNDONE", transactions: [], canUndo: false });
    expect(await balance(user.id, f.bank)).toBe(pesos(500_000));
    // Deshacer de nuevo no hace nada; ya no se puede confirmar.
    expect((await undoVoiceEntry(user.id, entry.id)).status).toBe("UNDONE");
    await expect(confirmVoiceEntry(user.id, entry.id, confirmAll(entry), TODAY)).rejects.toMatchObject({ code: "VOICE_NOT_PENDING" });
  });

  it("si el modelo inventa un importe, no se guarda solo y el importe queda vacío", async () => {
    const { user } = await voiceUser(true);
    const interpreter = modelInterpreter([{ ...CASE_17_MODEL[0]!, amount: "55000.00" }, CASE_17_MODEL[1]!]);
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers({ interpreter }), TODAY);
    expect(entry.status).toBe("NEEDS_REVIEW");
    expect(entry.drafts[0]!.amount).toBeNull();
    expect(entry.drafts[0]!.issues.map((i) => i.code)).toContain("NOT_SAID");
    expect(entry.notices).toContain("Mencionaste $ 50.000 y no se cargó como movimiento.");
  });

  it("un posible duplicado pide confirmación", async () => {
    const { f, user } = await voiceUser(true);
    await record(user.id, { type: "EXPENSE", amount: "32000", date: TODAY, accountId: f.bank, categoryId: f.categories.supermercado });
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers({ interpreter: modelInterpreter(CASE_17_MODEL) }), TODAY);
    expect(entry.status).toBe("NEEDS_REVIEW");
    expect(entry.drafts[1]!.similar).toMatchObject({ description: "Supermercado", amount: "32000.00" });
    expect(entry.drafts[1]!.issues.map((i) => i.field)).toEqual(["duplicate"]);
    expect(entry.drafts[0]!.issues).toEqual([]);
  });

  it("no se deshace si alguno de los movimientos se editó", async () => {
    const { user } = await voiceUser(true);
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers({ interpreter: modelInterpreter(CASE_17_MODEL) }), TODAY);
    const [first] = entry.transactions;
    await updateTransaction(user.id, first!.id, first!.version, {
      type: "EXPENSE",
      amount: "51000",
      date: first!.date,
      accountId: first!.account.id,
      categoryId: first!.category!.id,
    }, TODAY);
    await expect(undoVoiceEntry(user.id, entry.id)).rejects.toMatchObject({ code: "VOICE_EDITED" });
    expect((await getVoiceEntry(user.id, entry.id)).canUndo).toBe(false);
  });
});

describe("fallas y reintentos", () => {
  it("si el intérprete principal falla se usa el local y se pide revisión", async () => {
    const { user } = await voiceUser(true);
    const interpreter: TransactionInterpreter = {
      id: "anthropic",
      local: false,
      interpret: vi.fn(async () => {
        throw new VoiceProviderError("anthropic", "timeout", "tiempo agotado");
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers({ interpreter }), TODAY);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Nafta");
    warn.mockRestore();
    expect(entry).toMatchObject({ status: "NEEDS_REVIEW", interpreter: { model: "local", local: true, fallback: true } });
    expect(entry.drafts).toHaveLength(2);
  });

  it("un ítem mal formado del proveedor se descarta sin perder los demás", async () => {
    const { user } = await voiceUser();
    const interpreter = modelInterpreter([CASE_17_MODEL[0]!, { ...CASE_17_MODEL[1]!, type: "TRANSFER" as never }]);
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers({ interpreter }), TODAY);
    expect(entry.drafts).toHaveLength(1);
    expect(entry.notices).toContain("Una parte de lo dicho no se pudo interpretar: revisá si falta algún movimiento.");
  });

  it("si la transcripción falla queda FAILED y el reintento con el mismo id la retoma", async () => {
    const { user } = await voiceUser();
    const input = { clientRequestId: randomUUID(), durationMs: 2000, audio: AUDIO, mimeType: "audio/mp4" };
    const broken: Transcriber = {
      id: "openai",
      transcribe: async () => {
        throw new VoiceProviderError("openai", "server", "caído", 503);
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = await processVoiceAudio(user, input, providers({ transcriber: broken }), TODAY);
    warn.mockRestore();
    expect(failed).toMatchObject({ status: "FAILED", error: { code: "STT_FAILED" } });

    const retried = await processVoiceAudio(user, input, providers(), TODAY);
    expect(retried).toMatchObject({ id: failed.id, status: "NEEDS_REVIEW", error: null });
    expect((await prisma.voiceEntry.findUniqueOrThrow({ where: { id: failed.id } })).attempts).toBe(2);
  });

  it("una carga abandonada en proceso se puede retomar; una reciente no", async () => {
    const { user } = await voiceUser();
    const clientRequestId = randomUUID();
    const entry = await prisma.voiceEntry.create({ data: { userId: user.id, clientRequestId, inputType: "TEXT", status: "PROCESSING" } });
    const recent = await processVoiceText(user, { clientRequestId, text: CASE_17 }, providers(), TODAY);
    expect(recent).toMatchObject({ id: entry.id, status: "PROCESSING" });
    await prisma.voiceEntry.update({ where: { id: entry.id }, data: { startedAt: new Date(Date.now() - 5 * 60_000) } });
    const resumed = await processVoiceText(user, { clientRequestId, text: CASE_17 }, providers(), TODAY);
    expect(resumed).toMatchObject({ id: entry.id, status: "NEEDS_REVIEW" });
  });

  it("sin movimientos en lo dicho: FAILED con la transcripción", async () => {
    const { user } = await voiceUser();
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: "hola, ¿cómo andás?" }, providers(), TODAY);
    expect(entry).toMatchObject({ status: "FAILED", error: { code: "NO_MOVEMENTS" }, transcript: "hola, ¿cómo andás?" });
  });

  it("sin transcripción configurada, el audio se rechaza sin crear la carga", async () => {
    const { user } = await voiceUser();
    await expect(
      processVoiceAudio(user, { clientRequestId: randomUUID(), durationMs: 2000, audio: AUDIO, mimeType: AUDIO.type }, providers({ transcriber: null }), TODAY),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED", status: 503 });
    expect(await prisma.voiceEntry.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("revisión", () => {
  it("se guardan solo los borradores enviados; uno ajeno se rechaza", async () => {
    const { user } = await voiceUser();
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers(), TODAY);
    const [nafta] = confirmAll(entry).items;
    await expect(
      confirmVoiceEntry(user.id, entry.id, { items: [{ ...nafta!, key: randomUUID() }] }, TODAY),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { "items.0.key": "Este movimiento no pertenece a la carga." } });
    const saved = await confirmVoiceEntry(user.id, entry.id, { items: [{ ...nafta!, amount: "48000" }] }, TODAY);
    expect(saved.transactions.map((t) => t.amount)).toEqual(["48000.00"]);
    expect(saved.drafts).toHaveLength(1);
  });

  it("las reglas del motor se informan por ítem", async () => {
    const { user } = await voiceUser();
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers(), TODAY);
    const body = confirmAll(entry);
    body.items[1]!.date = "2026-09-15"; // antes de la apertura de la cuenta
    await expect(confirmVoiceEntry(user.id, entry.id, body, TODAY)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { "items.1.date": expect.stringContaining("se registra desde") },
    });
    // Nada quedó a medias.
    expect(await voiceTransactions(entry.id)).toHaveLength(0);
    expect((await getVoiceEntry(user.id, entry.id)).status).toBe("NEEDS_REVIEW");
  });

  it("descartar, y las cargas pendientes de revisión", async () => {
    const { user } = await voiceUser();
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers(), TODAY);
    expect(await listPendingVoiceEntries(user.id)).toEqual([expect.objectContaining({ id: entry.id, count: 2, transcript: CASE_17 })]);
    expect((await discardVoiceEntry(user.id, entry.id)).status).toBe("DISCARDED");
    expect((await discardVoiceEntry(user.id, entry.id)).status).toBe("DISCARDED");
    expect(await listPendingVoiceEntries(user.id)).toEqual([]);
    await expect(confirmVoiceEntry(user.id, entry.id, confirmAll(entry), TODAY)).rejects.toMatchObject({ code: "VOICE_NOT_PENDING" });
  });

  it("una carga de otra usuaria no existe", async () => {
    const { user } = await voiceUser();
    const { user: other } = await voiceUser();
    const entry = await processVoiceText(user, { clientRequestId: randomUUID(), text: CASE_17 }, providers(), TODAY);
    await expect(getVoiceEntry(other.id, entry.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(discardVoiceEntry(other.id, entry.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
