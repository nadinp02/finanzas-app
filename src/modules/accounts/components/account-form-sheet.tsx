"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { todayIn } from "@/lib/dates";
import type { FieldErrors } from "@/lib/errors";
import { ACCOUNT_TYPE_LABELS, ASSET_ACCOUNT_TYPES, type AssetAccountType } from "../rules";
import { createAccountSchema, updateAccountSchema, type AccountDTO } from "../schema";

interface AccountFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountDTO;
}

export function AccountFormSheet({ open, onOpenChange, account }: AccountFormSheetProps) {
  const router = useRouter();
  const { data, refresh } = useReferenceData();
  const today = todayIn(data?.user.timezone);
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AssetAccountType>((account?.type as AssetAccountType) ?? "BANK");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [openingBalance, setOpeningBalance] = useState(account?.openingBalance ?? "");
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today);
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    const body = { name, type, institution, openingBalance: openingBalance || "0", openingDate, ...(account && { isActive }) };
    const parsed = account ? updateAccountSchema.safeParse(body) : createAccountSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setSaving(true);
    try {
      if (account) await api(`/api/accounts/${account.id}`, { method: "PATCH", body: parsed.data });
      else await api("/api/accounts", { method: "POST", body: parsed.data });
      toast.success(account ? "Cuenta actualizada" : "Cuenta creada");
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
          <SheetTitle className="text-xl font-bold">{account ? "Editar cuenta" : "Nueva cuenta"}</SheetTitle>
          <SheetDescription>El saldo inicial es el que tenía la cuenta al empezar a registrarla.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <FormField id="account-name" label="Nombre" error={errors.name}>
            <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Banco Nación, Efectivo…" />
          </FormField>
          {!account && (
            <div className="grid gap-2">
              <span className="text-[13px] font-semibold text-muted-foreground">Tipo</span>
              <ChoiceChips
                label="Tipo de cuenta"
                value={type}
                options={ASSET_ACCOUNT_TYPES.map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }))}
                onChange={setType}
              />
            </div>
          )}
          <FormField id="account-institution" label="Entidad (opcional)" error={errors.institution}>
            <Input id="account-institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </FormField>
          <FormField id="account-balance" label="Saldo inicial" error={errors.openingBalance}>
            <MoneyInput id="account-balance" allowNegative value={openingBalance} onChange={setOpeningBalance} />
          </FormField>
          <FormField id="account-date" label="Fecha del saldo inicial" error={errors.openingDate}>
            <Input id="account-date" type="date" max={today} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </FormField>
          {account && (
            <label className="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
              <span className="text-[15px] font-semibold">Cuenta activa</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
          )}
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} {account ? "Guardar cambios" : "Crear cuenta"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
