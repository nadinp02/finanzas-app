"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import { formatDayHeading, type LocalDate } from "@/lib/dates";
import type { TransactionDTO } from "../schema";
import { TransactionRow } from "./transaction-row";
import { TransactionSheet } from "./transaction-sheet";

interface TransactionFeedProps {
  initialItems: TransactionDTO[];
  initialCursor: string | null;
  /** Query string de los filtros activos, para pedir las páginas siguientes. */
  query: string;
  today: LocalDate;
  emptyText?: string;
}

function groupByDate(items: TransactionDTO[]): [LocalDate, TransactionDTO[]][] {
  const groups = new Map<LocalDate, TransactionDTO[]>();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return [...groups.entries()];
}

/** Lista agrupada por día, con edición al tocar y paginación por cursor. */
export function TransactionFeed({ initialItems, initialCursor, query, today, emptyText = "No hay movimientos." }: TransactionFeedProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TransactionDTO | null>(null);
  const [source, setSource] = useState(initialItems);

  // Después de router.refresh() llegan datos nuevos del servidor: se reemplaza la lista.
  if (source !== initialItems) {
    setSource(initialItems);
    setItems(initialItems);
    setCursor(initialCursor);
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const separator = query ? "&" : "";
      const page = await api<{ items: TransactionDTO[]; nextCursor: string | null }>(
        `/api/transactions?${query}${separator}cursor=${encodeURIComponent(cursor)}`,
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-[15px] text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="grid gap-5">
      {groupByDate(items).map(([date, rows]) => (
        <section key={date} aria-label={formatDayHeading(date, today)}>
          <h3 className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground first-letter:uppercase">{formatDayHeading(date, today)}</h3>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {rows.map((t) => (
              <TransactionRow key={t.id} t={t} onSelect={() => setEditing(t)} />
            ))}
          </div>
        </section>
      ))}
      {cursor && (
        <Button variant="outline" onClick={loadMore} disabled={loading} className="mx-auto">
          {loading && <Loader2 className="animate-spin" />} Ver más movimientos
        </Button>
      )}
      <TransactionSheet
        open={editing !== null}
        transaction={editing ?? undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}
