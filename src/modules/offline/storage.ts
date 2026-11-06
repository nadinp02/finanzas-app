"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BootstrapData } from "@/modules/settings/service";

/** Operación de escritura pendiente de enviar al servidor. */
export interface OutboxEntry {
  /** UUID local de la operación. */
  id: string;
  kind: "transaction.create";
  /** Cuerpo de la solicitud (incluye el clientId idempotente). */
  payload: unknown;
  /** Resumen para mostrar en la lista mientras no se sincroniza. */
  preview: { description: string; amount: string; type: string; date: string };
  status: "pending" | "syncing" | "error";
  attempts: number;
  lastError?: string;
  createdAt: number;
  nextAttemptAt: number;
}

interface FinanzasDB extends DBSchema {
  kv: { key: string; value: unknown };
  outbox: { key: string; value: OutboxEntry; indexes: { "by-created": number } };
}

const DB_NAME = "cuentas-claras";
let dbPromise: Promise<IDBPDatabase<FinanzasDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<FinanzasDB>> | null {
  if (typeof indexedDB === "undefined") return null;
  dbPromise ??= openDB<FinanzasDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("kv");
      db.createObjectStore("outbox", { keyPath: "id" }).createIndex("by-created", "createdAt");
    },
  });
  return dbPromise;
}

export async function loadCachedBootstrap(): Promise<BootstrapData | null> {
  try {
    const db = await getDb();
    return ((await db?.get("kv", "bootstrap")) as BootstrapData | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveCachedBootstrap(data: BootstrapData): Promise<void> {
  try {
    const db = await getDb();
    await db?.put("kv", data, "bootstrap");
  } catch {
    // Almacenamiento no disponible (navegación privada): la app sigue funcionando en línea.
  }
}

/** Al cerrar sesión no quedan datos financieros en el dispositivo. */
export async function clearLocalData(): Promise<void> {
  try {
    const db = await getDb();
    if (db) {
      db.close();
      dbPromise = null;
    }
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    if ("caches" in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
  } catch {
    // Mejor esfuerzo.
  }
}
