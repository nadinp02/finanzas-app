"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { todayIn } from "@/lib/dates";
import type { FieldErrors } from "@/lib/errors";
import { isCard } from "@/modules/accounts/rules";
import { createCardSchema, updateCardSchema, type CardStatusDTO } from "../schema";
import { CardFields, cardPayload, emptyCard, type CardFieldsValue } from "./card-fields";

function issuesToFields(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  return Object.fromEntries(issues.map((issue) => [String(issue.path[0]), issue.message]));
}

export function CardFormSheet({ open, onOpenChange, card }: { open: boolean; onOpenChange: (open: boolean) => void; card?: CardStatusDTO }) {
  const router = useRouter();
  const { data, refresh } = useReferenceData();
  const today = todayIn(data?.user.timezone);
  const [value, setValue] = useState<CardFieldsValue>(
    card
      ? {
          ...emptyCard,
          name: card.name,
          institution: card.institution ?? "",
          creditLimit: card.creditLimit ?? "",
          closingDay: String(card.closingDay),
          dueDay: String(card.dueDay),
          paymentAccountId: card.paymentAccountId ?? "",
          openingStatementBalance: card.openingStatementBalance,
          openingUnbilledBalance: card.openingUnbilledBalance,
        }
      : emptyCard,
  );
  const [openingDate, setOpeningDate] = useState(card?.openingDate ?? today);
  const [isActive, setIsActive] = useState(card?.isActive ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const paymentAccounts = (data?.accounts ?? []).filter((a) => a.isActive && !isCard(a.type));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    const payload = cardPayload(value);
    const parsed = card
      ? updateCardSchema.safeParse({
          name: payload.name,
          institution: payload.institution,
          creditLimit: payload.creditLimit ?? null,
          closingDay: payload.closingDay,
          dueDay: payload.dueDay,
          paymentAccountId: payload.paymentAccountId ?? null,
          openingStatementBalance: payload.openingStatementBalance,
          openingUnbilledBalance: payload.openingUnbilledBalance,
          isActive,
        })
      : createCardSchema.safeParse({ ...payload, openingDate });
    if (!parsed.success) {
      setErrors(issuesToFields(parsed.error.issues));
      return;
    }
    setSaving(true);
    try {
      if (card) await api(`/api/cards/${card.id}`, { method: "PATCH", body: parsed.data });
      else await api("/api/cards", { method: "POST", body: parsed.data });
      toast.success(card ? "Tarjeta actualizada" : "Tarjeta creada");
      onOpenChange(false);
      router.refresh();
      void refresh().catch(() => {});
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 overflow-y-auto px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="mb-4 p-0 pr-10">
          <SheetTitle className="text-xl font-bold">{card ? "Editar tarjeta" : "Nueva tarjeta"}</SheetTitle>
          <SheetDescription>Los días de cierre y vencimiento definen en qué resumen entra cada compra.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <CardFields idPrefix="card" value={value} onChange={setValue} paymentAccounts={paymentAccounts} errors={errors} showPreexisting={!card} />
          {!card && (
            <FormField id="card-opening-date" label="Fecha desde la que registrás esta tarjeta" error={errors.openingDate}>
              <Input id="card-opening-date" type="date" max={today} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
            </FormField>
          )}
          {card && (
            <label className="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
              <span className="text-[15px] font-semibold">Tarjeta activa</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
          )}
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} {card ? "Guardar cambios" : "Crear tarjeta"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
