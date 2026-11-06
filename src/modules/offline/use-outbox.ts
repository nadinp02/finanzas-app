"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { OutboxEntry } from "./storage";
import { listOutbox, processOutbox, subscribeOutbox } from "./outbox";

/** Lista viva de operaciones pendientes de sincronizar. */
export function useOutboxEntries(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => {
    let active = true;
    const load = () => void listOutbox().then((items) => active && setEntries(items)).catch(() => {});
    load();
    const unsubscribe = subscribeOutbox(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return entries;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Sincroniza la cola al abrir la app, al recuperar la conexión y al volver a primer plano.
 * Safari de iOS no tiene Background Sync: con la app cerrada no se puede sincronizar.
 */
export function useOutboxSync(): void {
  const router = useRouter();
  useEffect(() => {
    const run = async () => {
      if (!navigator.onLine) return;
      const result = await processOutbox().catch(() => null);
      if (!result) return;
      if (result.synced > 0) {
        toast.success(result.synced === 1 ? "Se sincronizó 1 movimiento" : `Se sincronizaron ${result.synced} movimientos`);
        router.refresh();
      }
      if (result.failed > 0) toast.error("Hay movimientos sin conexión que necesitan revisión.");
    };
    void run();
    const onVisible = () => document.visibilityState === "visible" && void run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(run, 60_000);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [router]);
}
