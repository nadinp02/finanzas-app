"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { todayIn } from "@/lib/dates";
import { ACCOUNT_TYPE_LABELS, ASSET_ACCOUNT_TYPES, type AssetAccountType } from "@/modules/accounts/rules";
import { CardFields, cardPayload, emptyCard, type CardFieldsValue } from "@/modules/cards/components/card-fields";
import { onboardingSchema } from "../schema";

interface AccountDraft {
  ref: string;
  name: string;
  type: AssetAccountType;
  institution: string;
  openingBalance: string;
}

let refCounter = 0;
const nextRef = () => `r${(refCounter += 1)}`;

const INITIAL_ACCOUNTS: AccountDraft[] = [
  { ref: "cash", name: "Efectivo", type: "CASH", institution: "", openingBalance: "" },
  { ref: "mp", name: "Mercado Pago", type: "DIGITAL_WALLET", institution: "", openingBalance: "" },
  { ref: "bank", name: "Caja de ahorro", type: "SAVINGS", institution: "", openingBalance: "" },
];

export function OnboardingForm({ timezone }: { timezone: string }) {
  const router = useRouter();
  const today = todayIn(timezone);
  const [startDate, setStartDate] = useState(today);
  const [accounts, setAccounts] = useState<AccountDraft[]>(INITIAL_ACCOUNTS);
  const [cards, setCards] = useState<(CardFieldsValue & { ref: string })[]>([]);
  const [defaultRef, setDefaultRef] = useState<string>("mp");
  const [autoSave, setAutoSave] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const updateAccount = (index: number, patch: Partial<AccountDraft>) =>
    setAccounts((current) => current.map((account, i) => (i === index ? { ...account, ...patch } : account)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    const body = {
      trackingStartDate: startDate,
      accounts: accounts.map((a) => ({ ...a, openingBalance: a.openingBalance || "0" })),
      cards: cards.map(({ ref, ...card }) => {
        const payload = cardPayload(card);
        return { ref, ...payload, paymentAccountRef: card.paymentAccountId || undefined, paymentAccountId: undefined };
      }),
      defaultAccountRef: accounts.some((a) => a.ref === defaultRef) ? defaultRef : undefined,
      voiceAutoSave: autoSave,
    };
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((issue) => issue.message))]);
      return;
    }
    setSaving(true);
    try {
      await api("/api/onboarding", { method: "POST", body: parsed.data });
      router.replace("/");
      router.refresh();
    } catch (error) {
      setErrors([error instanceof ApiError && error.fields ? Object.values(error.fields).join(" ") : errorMessage(error)]);
      setSaving(false);
    }
  }

  const accountOptions = accounts.filter((a) => a.name.trim()).map((a) => ({ id: a.ref, name: a.name }));

  return (
    <form onSubmit={submit} noValidate className="grid gap-10">
      <section className="grid gap-3">
        <h2 className="text-lg font-bold">1. ¿Desde cuándo registrás?</h2>
        <p className="text-[15px] text-muted-foreground">
          Usá los saldos que tenés hoy. Los informes empiezan en esta fecha y no muestran nada anterior.
        </p>
        <Input type="date" aria-label="Fecha de inicio" max={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="max-w-48" />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">2. Tus cuentas y cuánto hay en cada una</h2>
        {accounts.map((account, index) => (
          <div key={account.ref} className="grid gap-3 rounded-2xl border bg-card p-4">
            <div className="flex gap-2">
              <Input aria-label="Nombre de la cuenta" value={account.name} onChange={(e) => updateAccount(index, { name: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar cuenta" onClick={() => setAccounts((c) => c.filter((_, i) => i !== index))}>
                <Trash2 />
              </Button>
            </div>
            <ChoiceChips
              label="Tipo"
              value={account.type}
              options={ASSET_ACCOUNT_TYPES.map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }))}
              onChange={(type) => updateAccount(index, { type })}
            />
            <FormField id={`balance-${account.ref}`} label="Saldo actual">
              <MoneyInput id={`balance-${account.ref}`} allowNegative value={account.openingBalance} onChange={(openingBalance) => updateAccount(index, { openingBalance })} />
            </FormField>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => setAccounts((c) => [...c, { ref: nextRef(), name: "", type: "BANK", institution: "", openingBalance: "" }])}
        >
          <Plus /> Agregar cuenta
        </Button>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">3. Tarjetas de crédito</h2>
        <p className="text-[15px] text-muted-foreground">Cargá lo que debés hoy. Si no usás tarjetas, salteá este paso.</p>
        {cards.map((card, index) => (
          <div key={card.ref} className="grid gap-3 rounded-2xl border bg-card p-4">
            <CardFields
              idPrefix={card.ref}
              value={card}
              onChange={(value) => setCards((current) => current.map((c, i) => (i === index ? { ...value, ref: c.ref } : c)))}
              paymentAccounts={accountOptions}
            />
            <Button type="button" variant="ghost" className="justify-self-end" onClick={() => setCards((c) => c.filter((_, i) => i !== index))}>
              <Trash2 /> Quitar tarjeta
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setCards((c) => [...c, { ...emptyCard, ref: nextRef() }])}>
          <Plus /> Agregar tarjeta
        </Button>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">4. Preferencias</h2>
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Cuenta habitual (se preselecciona al cargar)</span>
          <ChoiceChips label="Cuenta habitual" value={defaultRef} options={accountOptions.map((a) => ({ value: a.id, label: a.name }))} onChange={setDefaultRef} />
        </div>
        <label className="flex items-center justify-between gap-4 rounded-xl border bg-card px-3.5 py-3">
          <span>
            <span className="block text-[15px] font-semibold">Guardar automáticamente lo dictado</span>
            <span className="block text-[13px] text-muted-foreground">Solo cuando todo quedó claro. Siempre vas a poder deshacer.</span>
          </span>
          <Switch checked={autoSave} onCheckedChange={setAutoSave} />
        </label>
      </section>

      {errors.length > 0 && (
        <div role="alert" className="grid gap-1 rounded-xl bg-negative-soft px-4 py-3 text-sm font-medium text-negative">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <Button type="submit" size="lg" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />} Empezar
      </Button>
    </form>
  );
}
