"use client";

import { AlertTriangle, CloudOff, Loader2, RotateCw, Trash2 } from "lucide-react";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/dates";
import { discardEntry, retryEntry } from "../outbox";
import { useOutboxEntries } from "../use-outbox";

/** Movimientos cargados sin conexión que todavía no llegaron al servidor. */
export function OutboxList() {
  const entries = useOutboxEntries();
  if (entries.length === 0) return null;
  return (
    <section aria-label="Pendientes de sincronizar" className="mb-6">
      <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-muted-foreground">
        <CloudOff className="size-4" /> Guardados en este dispositivo
      </h3>
      <div className="divide-y overflow-hidden rounded-2xl border border-dashed bg-card">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{entry.preview.description}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {formatShortDate(entry.preview.date)} ·{" "}
                {entry.status === "syncing" ? (
                  <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Sincronizando</span>
                ) : entry.status === "error" ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-negative"><AlertTriangle className="size-3" /> {entry.lastError}</span>
                ) : (
                  "Pendiente de sincronizar"
                )}
              </p>
            </div>
            <Amount value={entry.preview.amount} tone="muted" className="text-[15px] font-semibold" />
            {entry.status === "error" && (
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Reintentar" onClick={() => void retryEntry(entry.id)}>
                  <RotateCw />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Descartar"
                  onClick={() => window.confirm("¿Descartar este movimiento? No se guardará.") && void discardEntry(entry.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
