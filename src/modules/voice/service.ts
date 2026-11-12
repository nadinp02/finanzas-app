import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type VoiceEntry } from "@/generated/prisma/client";
import type { VoiceInputType } from "@/generated/prisma/enums";
import { addDays, todayIn, toDbDate, type LocalDate } from "@/lib/dates";
import { AppError, errors, type FieldErrors } from "@/lib/errors";
import { formatMoney, parseDecimal } from "@/lib/money";
import { normalizeText } from "@/lib/text";
import { audit } from "@/server/audit";
import { prisma, transaction, type Tx } from "@/server/db";
import { listCategories } from "@/modules/categories/service";
import { topMerchantNames } from "@/modules/merchants/service";
import { insertTransaction, listTransactionsByVoiceEntry } from "@/modules/transactions/service";
import type { TransactionDTO } from "@/modules/transactions/schema";
import { voiceProviders } from "./providers";
import { VoiceProviderError, type InterpretationResult, type Transcription, type VoiceProviders } from "./providers/types";
import { canAutoSave, categoryRefs, validateInterpretation, type VoiceContext } from "./rules";
import {
  baseMimeType,
  interpretedItemSchema,
  storedVoiceItemsSchema,
  VOICE_ERROR_MESSAGES,
  VOICE_LIMITS,
  type ConfirmVoiceInput,
  type InterpretedItem,
  type PendingVoiceEntry,
  type StoredVoiceItems,
  type VoiceDraft,
  type VoiceEntryDTO,
} from "./schema";
import { cleanTranscript } from "./text";

/** Lo que el caso de uso necesita de la usuaria (sale de la sesión). */
export interface VoiceUser {
  id: string;
  timezone: string;
  trackingStartDate: LocalDate | null;
  defaultAccountId: string | null;
  voiceAutoSave: boolean;
}

// ── Lectura ────────────────────────────────────────────────────────────────────────────────────

const EMPTY_ITEMS: StoredVoiceItems = { drafts: [], notices: [], fallback: false, autoSaved: false };

function readItems(entry: Pick<VoiceEntry, "items">): StoredVoiceItems {
  const parsed = storedVoiceItemsSchema.safeParse(entry.items);
  return parsed.success ? parsed.data : EMPTY_ITEMS;
}

function toDTO(entry: VoiceEntry, transactions: TransactionDTO[] = []): VoiceEntryDTO {
  const items = readItems(entry);
  return {
    id: entry.id,
    clientRequestId: entry.clientRequestId,
    inputType: entry.inputType,
    status: entry.status,
    transcript: entry.transcript,
    drafts: items.drafts,
    notices: items.notices,
    interpreter: entry.interpreterModel
      ? { model: entry.interpreterModel, local: entry.interpreterModel === "local", fallback: items.fallback }
      : null,
    error: entry.errorCode
      ? { code: entry.errorCode, message: VOICE_ERROR_MESSAGES[entry.errorCode] ?? VOICE_ERROR_MESSAGES.INTERNAL_ERROR! }
      : null,
    transactions,
    canUndo: entry.status === "SAVED" && transactions.length > 0 && transactions.every((t) => t.version === 1),
    autoSaved: items.autoSaved,
    createdAt: entry.createdAt.toISOString(),
    processedAt: entry.processedAt?.toISOString() ?? null,
    resolvedAt: entry.resolvedAt?.toISOString() ?? null,
  };
}

async function entryDTO(entry: VoiceEntry, db: Tx = prisma): Promise<VoiceEntryDTO> {
  const transactions = entry.status === "SAVED" ? await listTransactionsByVoiceEntry(entry.userId, entry.id, db) : [];
  return toDTO(entry, transactions);
}

export async function getVoiceEntry(userId: string, id: string): Promise<VoiceEntryDTO> {
  const entry = await prisma.voiceEntry.findFirst({ where: { id, userId } });
  if (!entry) throw errors.notFound("No encontramos esa carga por voz.");
  return entryDTO(entry);
}

/** Cargas que esperan revisión (se pueden retomar más tarde). */
export async function listPendingVoiceEntries(userId: string, limit = 5): Promise<PendingVoiceEntry[]> {
  const entries = await prisma.voiceEntry.findMany({
    where: { userId, status: "NEEDS_REVIEW" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return entries.map((entry) => ({
    id: entry.id,
    transcript: entry.transcript ? entry.transcript.slice(0, 120) : null,
    count: readItems(entry).drafts.length,
    createdAt: entry.createdAt.toISOString(),
    date: todayIn(undefined, entry.createdAt),
  }));
}

// ── Reclamo idempotente ────────────────────────────────────────────────────────────────────────

interface AudioMeta {
  audioDurationMs?: number;
  audioMimeType?: string;
  audioBytes?: number;
}

type Claim = { claimed: true; entry: VoiceEntry } | { claimed: false; entry: VoiceEntry };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Un `clientRequestId` es una grabación. Reintentar con el mismo id devuelve la carga existente; solo
 * se vuelve a procesar si había fallado o si quedó en proceso abandonada. `attempts` actúa como
 * token de versión: de dos reintentos simultáneos, solo uno reprocesa.
 */
async function claimEntry(userId: string, clientRequestId: string, inputType: VoiceInputType, meta: AudioMeta, now: Date): Promise<Claim> {
  let existing = await prisma.voiceEntry.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId } } });
  if (!existing) {
    try {
      const entry = await prisma.voiceEntry.create({
        data: { userId, clientRequestId, inputType, status: "PROCESSING", startedAt: now, ...meta },
      });
      return { claimed: true, entry };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      existing = await prisma.voiceEntry.findUniqueOrThrow({ where: { userId_clientRequestId: { userId, clientRequestId } } });
    }
  }
  const stale = existing.status === "PROCESSING" && now.getTime() - existing.startedAt.getTime() > VOICE_LIMITS.staleProcessingMs;
  if (existing.status !== "FAILED" && !stale) return { claimed: false, entry: existing };
  const { count } = await prisma.voiceEntry.updateMany({
    where: { id: existing.id, attempts: existing.attempts, status: existing.status },
    data: { status: "PROCESSING", attempts: { increment: 1 }, startedAt: now, errorCode: null, processedAt: null, ...meta },
  });
  const current = await prisma.voiceEntry.findUniqueOrThrow({ where: { id: existing.id } });
  return count === 1 ? { claimed: true, entry: current } : { claimed: false, entry: current };
}

/** Termina un intento solo si nadie lo retomó mientras tanto. */
async function finishAttempt(entry: VoiceEntry, data: Prisma.VoiceEntryUpdateManyMutationInput): Promise<VoiceEntry> {
  await prisma.voiceEntry.updateMany({
    where: { id: entry.id, attempts: entry.attempts, status: "PROCESSING" },
    data: { ...data, processedAt: new Date() },
  });
  return prisma.voiceEntry.findUniqueOrThrow({ where: { id: entry.id } });
}

// ── Procesamiento ──────────────────────────────────────────────────────────────────────────────

async function loadContext(user: VoiceUser, today: LocalDate): Promise<VoiceContext> {
  const [accounts, categories, merchants] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    listCategories(user.id),
    prisma.merchant.findMany({
      where: { userId: user.id },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      take: 200,
      select: { name: true, aliases: true, defaultCategoryId: true },
    }),
  ]);
  return {
    today,
    trackingStartDate: user.trackingStartDate,
    accounts,
    categories: categoryRefs(categories),
    merchants,
    defaultAccountId: user.defaultAccountId,
  };
}

function logProviderFailure(stage: "stt" | "interpreter", error: unknown) {
  // Sin la transcripción ni datos financieros: solo qué falló.
  const detail = error instanceof VoiceProviderError ? { provider: error.provider, failure: error.failure, status: error.status } : { name: error instanceof Error ? error.name : typeof error };
  console.warn(JSON.stringify({ level: "warn", event: "voice_provider_failure", stage, ...detail }));
}

/**
 * Valida la forma de lo que devolvió un proveedor, ítem por ítem: uno mal formado se descarta sin
 * perder los demás. Solo se ajustan rangos numéricos (confianza 0–1, "1 cuota" = sin cuotas).
 */
function parseInterpreterItems(raw: unknown): { items: InterpretedItem[]; rejected: number } | null {
  if (!Array.isArray(raw)) return null;
  const items: InterpretedItem[] = [];
  let rejected = 0;
  for (const candidate of raw.slice(0, VOICE_LIMITS.maxItems)) {
    const value = candidate && typeof candidate === "object" ? { ...(candidate as Record<string, unknown>) } : candidate;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.confidence === "number") record.confidence = Math.min(1, Math.max(0, record.confidence));
      if (typeof record.installments === "number" && record.installments <= 1) record.installments = null;
    }
    const parsed = interpretedItemSchema.safeParse(value);
    if (parsed.success) items.push(parsed.data);
    else rejected += 1;
  }
  return { items, rejected };
}

async function interpret(transcript: string, ctx: VoiceContext, providers: VoiceProviders) {
  const attempt = async (interpreter: VoiceProviders["interpreter"]) => {
    const result: InterpretationResult = await interpreter.interpret({ transcript, context: ctx, signal: AbortSignal.timeout(40_000) });
    const parsed = parseInterpreterItems(result.items);
    if (!parsed) throw new VoiceProviderError(interpreter.id, "invalid_response", "Formato de salida inválido.");
    return { ...parsed, model: result.model.slice(0, 60), local: interpreter.local };
  };
  try {
    return { ...(await attempt(providers.interpreter)), fallback: false };
  } catch (error) {
    if (providers.interpreter.local) throw error;
    logProviderFailure("interpreter", error);
    return { ...(await attempt(providers.fallbackInterpreter)), fallback: true };
  }
}

/** Posible duplicado: mismo importe y comercio o descripción en ±1 día (BUSINESS_RULES §12.2). */
async function findSimilar(userId: string, draft: VoiceDraft, ctx: VoiceContext): Promise<VoiceDraft["similar"]> {
  if (!draft.amount) return null;
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      type: draft.type,
      amount: draft.amount,
      date: { gte: toDbDate(addDays(draft.date, -1)), lte: toDbDate(addDays(draft.date, 1)) },
    },
    select: { id: true, description: true, amount: true, date: true, merchant: { select: { name: true } } },
    take: 20,
  });
  const category = ctx.categories.find((c) => c.id === draft.categoryId);
  const labels = [draft.merchantName, draft.description, category?.name].filter(Boolean).map((label) => normalizeText(label!));
  const match = rows.find((row) =>
    [row.merchant?.name, row.description].some((value) => value && labels.includes(normalizeText(value))),
  );
  return match
    ? { id: match.id, description: match.description, amount: match.amount.toFixed(2), date: match.date.toISOString().slice(0, 10) }
    : null;
}

interface SaveItem {
  key: string;
  type: "EXPENSE" | "INCOME";
  amount: string;
  date: LocalDate;
  accountId: string;
  categoryId: string;
  merchantName?: string;
  description?: string;
  installments?: number;
}

/** Inserta los movimientos de una carga. Un error de validación se informa con el índice del ítem. */
async function insertItems(tx: Tx, userId: string, entryId: string, items: SaveItem[], today: LocalDate) {
  for (const [index, item] of items.entries()) {
    try {
      await insertTransaction(
        tx,
        userId,
        {
          type: item.type,
          amount: item.amount,
          date: item.date,
          accountId: item.accountId,
          categoryId: item.categoryId,
          merchantName: item.merchantName,
          description: item.description,
          ...(item.type === "EXPENSE" && item.installments ? { installments: item.installments } : {}),
          clientId: item.key,
        },
        { source: "VOICE", voiceEntryId: entryId, today },
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "VALIDATION_ERROR" && error.fields) {
        const fields: FieldErrors = {};
        for (const [field, message] of Object.entries(error.fields)) fields[`items.${index}.${field}`] = message;
        throw errors.validation(fields, "Revisá los movimientos marcados.");
      }
      throw error;
    }
  }
}

function draftToSaveItem(draft: VoiceDraft): SaveItem {
  return {
    key: draft.key,
    type: draft.type,
    amount: draft.amount!,
    date: draft.date,
    accountId: draft.accountId!,
    categoryId: draft.categoryId!,
    merchantName: draft.merchantName ?? undefined,
    description: draft.description ?? undefined,
    installments: draft.installments ?? undefined,
  };
}

/** Bloquea la carga para serializar confirmaciones, deshacer y descartes concurrentes. */
async function lockEntry(tx: Tx, userId: string, id: string): Promise<VoiceEntry> {
  await tx.$queryRaw`SELECT id FROM voice_entries WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
  const entry = await tx.voiceEntry.findFirst({ where: { id, userId } });
  if (!entry) throw errors.notFound("No encontramos esa carga por voz.");
  return entry;
}

class AttemptSuperseded extends Error {}

async function runPipeline(
  user: VoiceUser,
  entry: VoiceEntry,
  providers: VoiceProviders,
  getTranscript: () => Promise<Transcription>,
  today: LocalDate,
): Promise<VoiceEntryDTO> {
  let transcription: Transcription;
  try {
    transcription = await getTranscript();
  } catch (error) {
    logProviderFailure("stt", error);
    return entryDTO(await finishAttempt(entry, { status: "FAILED", errorCode: error instanceof VoiceProviderError ? "STT_FAILED" : "INTERNAL_ERROR" }));
  }
  const transcript = cleanTranscript(transcription.text).slice(0, VOICE_LIMITS.maxTranscriptLength);
  const sttModel = entry.inputType === "AUDIO" ? transcription.model.slice(0, 60) : null;
  if (!transcript) {
    return entryDTO(await finishAttempt(entry, { status: "FAILED", errorCode: "EMPTY_TRANSCRIPT", sttModel }));
  }

  try {
    const ctx = await loadContext(user, today);
    const interpretation = await interpret(transcript, ctx, providers);
    const { drafts, notices } = validateInterpretation(transcript, interpretation.items, ctx, {
      local: interpretation.local,
      newKey: randomUUID,
    });
    if (interpretation.rejected) notices.push("Una parte de lo dicho no se pudo interpretar: revisá si falta algún movimiento.");
    for (const draft of drafts) {
      draft.similar = await findSimilar(user.id, draft, ctx);
      if (draft.similar) {
        draft.issues.push({
          field: "duplicate",
          code: "SIMILAR",
          message: `Ya hay un movimiento parecido: ${draft.similar.description} · ${formatMoney(parseDecimal(draft.similar.amount))}. ¿Es otro?`,
        });
      }
    }
    const base = { transcript, sttModel, interpreterModel: interpretation.model };
    if (!drafts.length) {
      return entryDTO(await finishAttempt(entry, { ...base, status: "FAILED", errorCode: "NO_MOVEMENTS", items: { drafts: [], notices, fallback: interpretation.fallback, autoSaved: false } }));
    }

    if (user.voiceAutoSave && !interpretation.local && canAutoSave(drafts, notices)) {
      try {
        const saved = await transaction(async (tx) => {
          const locked = await lockEntry(tx, user.id, entry.id);
          if (locked.status !== "PROCESSING" || locked.attempts !== entry.attempts) throw new AttemptSuperseded();
          await insertItems(tx, user.id, entry.id, drafts.map(draftToSaveItem), today);
          const now = new Date();
          const updated = await tx.voiceEntry.update({
            where: { id: entry.id },
            data: { ...base, status: "SAVED", items: { drafts, notices, fallback: false, autoSaved: true }, processedAt: now, resolvedAt: now },
          });
          await audit({ userId: user.id, action: "VOICE_SAVE", entityType: "VoiceEntry", entityId: entry.id, metadata: { items: drafts.length, auto: true } }, tx);
          return updated;
        });
        return entryDTO(saved);
      } catch (error) {
        if (error instanceof AttemptSuperseded) return getVoiceEntry(user.id, entry.id);
        if (!(error instanceof AppError && error.code === "VALIDATION_ERROR")) throw error;
        // Una regla que solo verifica el motor (fecha de apertura de la cuenta, etc.): a revisión.
        for (const [field, message] of Object.entries((error as AppError).fields ?? {})) {
          const [, index] = field.split(".");
          drafts[Number(index)]?.issues.push({ field: "confidence", code: "ENGINE_RULE", message });
        }
      }
    }

    return entryDTO(await finishAttempt(entry, { ...base, status: "NEEDS_REVIEW", items: { drafts, notices, fallback: interpretation.fallback, autoSaved: false } }));
  } catch (error) {
    logProviderFailure("interpreter", error);
    await finishAttempt(entry, { status: "FAILED", errorCode: "INTERNAL_ERROR", transcript, sttModel });
    throw error;
  }
}

export interface ProcessAudioInput {
  clientRequestId: string;
  durationMs: number;
  audio: Blob;
  mimeType: string;
}

/**
 * Audio → transcripción → interpretación → validación → guardado automático o revisión.
 * El audio solo vive en memoria durante la transcripción: no se guarda en ningún lado.
 */
export async function processVoiceAudio(
  user: VoiceUser,
  input: ProcessAudioInput,
  providers: VoiceProviders = voiceProviders(),
  today: LocalDate = todayIn(user.timezone),
): Promise<VoiceEntryDTO> {
  const transcriber = providers.transcriber;
  if (!transcriber) throw errors.providerNotConfigured(VOICE_ERROR_MESSAGES.STT_NOT_CONFIGURED!);
  const mimeType = baseMimeType(input.mimeType);
  const claim = await claimEntry(
    user.id,
    input.clientRequestId,
    "AUDIO",
    { audioDurationMs: input.durationMs, audioMimeType: mimeType, audioBytes: input.audio.size },
    new Date(),
  );
  if (!claim.claimed) return entryDTO(claim.entry);
  const keywords = await topMerchantNames(user.id, 50);
  return runPipeline(user, claim.entry, providers, () =>
    transcriber.transcribe({ audio: input.audio, mimeType, durationMs: input.durationMs, keywords, signal: AbortSignal.timeout(40_000) }),
    today,
  );
}

/** La misma carga, escrita en lugar de dictada. */
export async function processVoiceText(
  user: VoiceUser,
  input: { clientRequestId: string; text: string },
  providers: VoiceProviders = voiceProviders(),
  today: LocalDate = todayIn(user.timezone),
): Promise<VoiceEntryDTO> {
  const claim = await claimEntry(user.id, input.clientRequestId, "TEXT", {}, new Date());
  if (!claim.claimed) return entryDTO(claim.entry);
  return runPipeline(user, claim.entry, providers, async () => ({ text: input.text, model: "text" }), today);
}

// ── Revisión ───────────────────────────────────────────────────────────────────────────────────

const NOT_PENDING_MESSAGES: Record<string, string> = {
  PROCESSING: "Esta carga todavía se está procesando.",
  DISCARDED: "Esta carga ya se descartó.",
  UNDONE: "Esta carga ya se deshizo.",
  FAILED: "Esta carga no tiene movimientos para guardar.",
  SAVED: "Esta carga ya se guardó.",
  NEEDS_REVIEW: "Esta carga todavía no se guardó.",
};

/**
 * Guarda los borradores revisados en una sola transacción. Idempotente: si la carga ya se guardó,
 * devuelve lo guardado (un reintento no duplica). Los borradores que no se envían se descartan.
 */
export async function confirmVoiceEntry(userId: string, id: string, input: ConfirmVoiceInput, today: LocalDate): Promise<VoiceEntryDTO> {
  const entry = await transaction(async (tx) => {
    const current = await lockEntry(tx, userId, id);
    if (current.status === "SAVED") return current;
    if (current.status !== "NEEDS_REVIEW") throw errors.conflict("VOICE_NOT_PENDING", NOT_PENDING_MESSAGES[current.status]!);
    const stored = readItems(current);
    const byKey = new Map(stored.drafts.map((draft) => [draft.key, draft]));
    const seen = new Set<string>();
    const fields: FieldErrors = {};
    input.items.forEach((item, index) => {
      if (!byKey.has(item.key) || seen.has(item.key)) fields[`items.${index}.key`] = "Este movimiento no pertenece a la carga.";
      seen.add(item.key);
    });
    if (Object.keys(fields).length) throw errors.validation(fields);

    await insertItems(tx, userId, id, input.items, today);
    const confirmed: VoiceDraft[] = input.items.map((item) => ({
      ...byKey.get(item.key)!,
      type: item.type,
      amount: item.amount,
      date: item.date,
      accountId: item.accountId,
      categoryId: item.categoryId,
      merchantName: item.merchantName ?? null,
      description: item.description ?? null,
      installments: item.installments ?? null,
      issues: [],
    }));
    const updated = await tx.voiceEntry.update({
      where: { id },
      data: { status: "SAVED", resolvedAt: new Date(), items: { ...stored, drafts: confirmed, autoSaved: false } },
    });
    await audit({ userId, action: "VOICE_SAVE", entityType: "VoiceEntry", entityId: id, metadata: { items: confirmed.length, discarded: stored.drafts.length - confirmed.length } }, tx);
    return updated;
  });
  return entryDTO(entry);
}

/** Borra los movimientos creados por la carga, mientras ninguno se haya editado. Idempotente. */
export async function undoVoiceEntry(userId: string, id: string): Promise<VoiceEntryDTO> {
  const entry = await transaction(async (tx) => {
    const current = await lockEntry(tx, userId, id);
    if (current.status === "UNDONE") return current;
    if (current.status !== "SAVED") throw errors.conflict("VOICE_NOT_SAVED", "Esta carga no tiene movimientos guardados para deshacer.");
    const rows = await tx.transaction.findMany({
      where: { userId, voiceEntryId: id },
      select: { id: true, version: true, type: true, amount: true, date: true, description: true },
    });
    if (rows.some((row) => row.version > 1)) {
      throw errors.conflict("VOICE_EDITED", "Ya editaste alguno de estos movimientos: borralos desde Movimientos.");
    }
    await tx.transaction.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    for (const row of rows) {
      await audit(
        {
          userId,
          action: "DELETE",
          entityType: "Transaction",
          entityId: row.id,
          metadata: { type: row.type, amount: row.amount.toFixed(2), date: row.date.toISOString().slice(0, 10), description: row.description, reason: "voice_undo" },
        },
        tx,
      );
    }
    const updated = await tx.voiceEntry.update({ where: { id }, data: { status: "UNDONE", resolvedAt: new Date() } });
    await audit({ userId, action: "VOICE_UNDO", entityType: "VoiceEntry", entityId: id, metadata: { items: rows.length } }, tx);
    return updated;
  });
  return entryDTO(entry);
}

/** Descarta una carga sin guardar nada. Idempotente. */
export async function discardVoiceEntry(userId: string, id: string): Promise<VoiceEntryDTO> {
  const entry = await transaction(async (tx) => {
    const current = await lockEntry(tx, userId, id);
    if (current.status === "DISCARDED") return current;
    if (current.status !== "NEEDS_REVIEW" && current.status !== "FAILED") {
      throw errors.conflict("VOICE_NOT_PENDING", NOT_PENDING_MESSAGES[current.status]!);
    }
    return tx.voiceEntry.update({ where: { id }, data: { status: "DISCARDED", resolvedAt: new Date() } });
  });
  return entryDTO(entry);
}
