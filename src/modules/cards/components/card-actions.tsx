"use client";

import { CalendarClock, Loader2, Pencil, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAppActions } from "@/components/app-shell/app-actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import { parseDecimal } from "@/lib/money";
import type { CardStatusDTO } from "../schema";
import { CardFormSheet } from "./card-form-sheet";

export function PayStatementButton({ card }: { card: CardStatusDTO }) {
  const { openQuickAdd } = useAppActions();
  const remaining = card.lastStatement ? parseDecimal(card.lastStatement.remaining) : 0n;
  return (
    <Button
      size="lg"
      className="w-full"
      onClick={() =>
        openQuickAdd({
          type: "CARD_PAYMENT",
          amount: remaining > 0n ? card.lastStatement!.remaining : undefined,
          accountId: card.paymentAccountId ?? undefined,
          toAccountId: card.id,
        })
      }
    >
      <Wallet /> {remaining > 0n ? "Pagar resumen" : "Registrar un pago"}
    </Button>
  );
}

/** Editar la tarjeta y ajustar las fechas reales del resumen en curso. */
export function CardDetailActions({ card }: { card: CardStatusDTO }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [closingDate, setClosingDate] = useState(card.currentPeriod.closingDate);
  const [dueDate, setDueDate] = useState(card.currentPeriod.dueDate);
  const [saving, setSaving] = useState(false);

  async function saveDates(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/cards/${card.id}/cycles/${card.currentPeriod.period}`, { method: "PUT", body: { closingDate, dueDate } });
      toast.success("Fechas del resumen actualizadas");
      setDatesOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setDatesOpen((v) => !v)}>
          <CalendarClock /> Fechas del resumen
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil /> Editar tarjeta
        </Button>
      </div>
      {datesOpen && (
        <form onSubmit={saveDates} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
          <p className="text-[13px] text-muted-foreground sm:col-span-2">
            Si el banco movió el cierre o el vencimiento del resumen en curso, cargá las fechas reales.
          </p>
          <FormField id="cycle-closing" label="Cierre">
            <Input id="cycle-closing" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
          </FormField>
          <FormField id="cycle-due" label="Vencimiento">
            <Input id="cycle-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <Button type="submit" disabled={saving} className="sm:col-span-2">
            {saving && <Loader2 className="animate-spin" />} Guardar fechas
          </Button>
        </form>
      )}
      {editing && <CardFormSheet open card={card} onOpenChange={(open) => !open && setEditing(false)} />}
    </div>
  );
}
