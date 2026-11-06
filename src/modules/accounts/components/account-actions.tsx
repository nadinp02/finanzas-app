"use client";

import { CreditCard, Loader2, Pencil, Plus, Scale, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatMoney, parseDecimal } from "@/lib/money";
import { CardFormSheet } from "@/modules/cards/components/card-form-sheet";
import type { AccountDTO } from "../schema";
import { AccountFormSheet } from "./account-form-sheet";

export function NewAccountButtons() {
  const [open, setOpen] = useState<"account" | "card" | null>(null);
  return (
    <>
      <Button size="sm" variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen("account")}>
        <Wallet /> Cuenta
      </Button>
      <Button size="sm" variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen("card")}>
        <CreditCard /> Tarjeta
      </Button>
      {open === "account" && <AccountFormSheet open onOpenChange={(o) => !o && setOpen(null)} />}
      {open === "card" && <CardFormSheet open onOpenChange={(o) => !o && setOpen(null)} />}
    </>
  );
}

/** Acciones del detalle de una cuenta: ajustar saldo, editar y eliminar. */
export function AccountDetailActions({ account }: { account: AccountDTO }) {
  const router = useRouter();
  const { refresh } = useReferenceData();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);

  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!actual) return;
    setBusy(true);
    try {
      const { adjustment } = await api<{ adjustment: { difference: string } | null }>(`/api/accounts/${account.id}/adjust`, {
        method: "POST",
        body: { actualBalance: actual },
      });
      toast.success(adjustment ? `Ajuste registrado: ${formatMoney(parseDecimal(adjustment.difference), { sign: "always" })}` : "El saldo ya coincidía");
      setAdjusting(false);
      setActual("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar ${account.name}?`)) return;
    try {
      await api(`/api/accounts/${account.id}`, { method: "DELETE" });
      toast("Cuenta eliminada");
      void refresh().catch(() => {});
      router.replace("/cuentas");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : errorMessage(error));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAdjusting((v) => !v)}>
          <Scale /> Ajustar saldo
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil /> Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={remove}>
          <Trash2 /> Eliminar
        </Button>
      </div>
      {adjusting && (
        <form onSubmit={adjust} className="grid gap-3 rounded-2xl border bg-card p-4">
          <FormField id="actual-balance" label="¿Cuánto hay realmente hoy?" hint="Se registra un ajuste por la diferencia. No cuenta como ingreso ni gasto.">
            <MoneyInput id="actual-balance" allowNegative value={actual} onChange={setActual} autoFocus />
          </FormField>
          <Button type="submit" disabled={busy || !actual}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Registrar ajuste
          </Button>
        </form>
      )}
      {editing && <AccountFormSheet open account={account} onOpenChange={(open) => !open && setEditing(false)} />}
    </div>
  );
}
