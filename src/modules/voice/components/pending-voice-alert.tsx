"use client";

import { ChevronRight, Mic } from "lucide-react";
import { useAppActions } from "@/components/app-shell/app-actions";
import type { PendingVoiceEntry } from "../schema";

/** Cargas por voz sin revisar: se retoman desde el inicio. */
export function PendingVoiceAlert({ items }: { items: PendingVoiceEntry[] }) {
  const { openVoiceEntry } = useAppActions();
  return items.map((item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => openVoiceEntry(item.id)}
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-warning/40 bg-card px-4 py-3 text-left hover:bg-accent/50"
    >
      <Mic className="size-5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">
          {item.count === 1 ? "Carga por voz para revisar" : `Carga por voz para revisar (${item.count} movimientos)`}
        </span>
        {item.transcript && <span className="block truncate text-[13px] text-muted-foreground">«{item.transcript}»</span>}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  ));
}
