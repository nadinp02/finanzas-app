"use client";

import { ApiError, NetworkError, errorMessage } from "@/lib/api-client";
import { createTransactionRequest, newClientId } from "@/modules/transactions/client";
import { TRANSACTION_TYPE_LABELS, type TransactionDTO, type TransactionInput } from "@/modules/transactions/schema";
import { getDb, type OutboxEntry } from "./storage";

const changes = new EventTarget();

function notify() {
  changes.dispatchEvent(new Event("change"));
}

export function subscribeOutbox(listener: () => void): () => void {
  changes.addEventListener("change", listener);
  return () => changes.removeEventListener("change", listener);
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db ? db.getAllFromIndex("outbox", "by-created") : [];
}

async function putEntry(entry: OutboxEntry) {
  const db = await getDb();
  if (!db) throw new Error("Este navegador no permite guardar datos sin conexión.");
  await db.put("outbox", entry);
  notify();
}

export async function discardEntry(id: string): Promise<void> {
  const db = await getDb();
  await db?.delete("outbox", id);
  notify();
}

/** Reemplaza los datos de una operación con error (corregida por la usuaria) y la reintenta. */
export async function retryEntry(id: string, input?: TransactionInput): Promise<void> {
  const db = await getDb();
  const entry = await db?.get("outbox", id);
  if (!entry) return;
  const payload = input ? { ...input, clientId: (entry.payload as { clientId: string }).clientId } : entry.payload;
  await putEntry({
    ...entry,
    payload,
    preview: input ? previewOf(input) : entry.preview,
    status: "pending",
    lastError: undefined,
    nextAttemptAt: 0,
  });
  void processOutbox();
}

function previewOf(input: TransactionInput): OutboxEntry["preview"] {
  const merchant = "merchantName" in input ? input.merchantName : undefined;
  return {
    description: input.description || merchant || TRANSACTION_TYPE_LABELS[input.type],
    amount: input.amount,
    type: input.type,
    date: input.date,
  };
}

/**
 * Alta de un movimiento: se intenta enviar; si no hay conexión queda en la cola local con su
 * `clientId`, así el reintento nunca duplica (el servidor responde con el ya existente).
 */
export async function submitNewTransaction(
  input: TransactionInput,
): Promise<{ status: "saved"; transaction: TransactionDTO } | { status: "queued" }> {
  const clientId = newClientId();
  try {
    return { status: "saved", transaction: await createTransactionRequest(input, clientId) };
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
    await putEntry({
      id: crypto.randomUUID(),
      kind: "transaction.create",
      payload: { ...input, clientId },
      preview: previewOf(input),
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
      nextAttemptAt: 0,
    });
    return { status: "queued" };
  }
}

const MAX_BACKOFF_MS = 5 * 60_000;
let running: Promise<SyncResult> | null = null;

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
}

async function runOnce(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, pending: 0 };
  const entries = await listOutbox();
  for (const entry of entries) {
    if (entry.status === "error") {
      result.failed += 1;
      continue;
    }
    if (entry.nextAttemptAt > Date.now()) {
      result.pending += 1;
      continue;
    }
    await putEntry({ ...entry, status: "syncing" });
    try {
      const payload = entry.payload as TransactionInput & { clientId: string };
      await createTransactionRequest(payload, payload.clientId);
      await discardEntry(entry.id);
      result.synced += 1;
    } catch (error) {
      if (error instanceof NetworkError) {
        const attempts = entry.attempts + 1;
        await putEntry({
          ...entry,
          status: "pending",
          attempts,
          nextAttemptAt: Date.now() + Math.min(MAX_BACKOFF_MS, 2 ** attempts * 1000),
        });
        // Sin conexión no tiene sentido seguir con el resto de la cola.
        result.pending += entries.length - result.synced - result.failed;
        return result;
      }
      // Rechazo del servidor (validación o conflicto): requiere decisión de la usuaria.
      await putEntry({
        ...entry,
        status: "error",
        attempts: entry.attempts + 1,
        lastError: error instanceof ApiError ? error.message : errorMessage(error),
      });
      result.failed += 1;
    }
  }
  return result;
}

/** Procesa la cola en orden. Una sola ejecución a la vez, también entre pestañas. */
export function processOutbox(): Promise<SyncResult> {
  running ??= (async () => {
    try {
      if (typeof navigator !== "undefined" && "locks" in navigator) {
        return await navigator.locks.request("cuentas-outbox", runOnce);
      }
      return await runOnce();
    } finally {
      running = null;
    }
  })();
  return running;
}
