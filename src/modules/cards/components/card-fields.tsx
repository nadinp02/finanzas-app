"use client";

import { Plus, Trash2 } from "lucide-react";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";

export interface PreexistingPlanDraft {
  description: string;
  installmentAmount: string;
  nextInstallmentNumber: string;
  installmentCount: string;
}

export interface CardFieldsValue {
  name: string;
  institution: string;
  creditLimit: string;
  closingDay: string;
  dueDay: string;
  paymentAccountId: string;
  openingStatementBalance: string;
  openingUnbilledBalance: string;
  preexistingPlans: PreexistingPlanDraft[];
}

export const emptyCard: CardFieldsValue = {
  name: "",
  institution: "",
  creditLimit: "",
  closingDay: "",
  dueDay: "",
  paymentAccountId: "",
  openingStatementBalance: "",
  openingUnbilledBalance: "",
  preexistingPlans: [],
};

/** Convierte el borrador del formulario al cuerpo que valida la API. */
export function cardPayload(value: CardFieldsValue) {
  return {
    name: value.name,
    institution: value.institution,
    creditLimit: value.creditLimit || undefined,
    closingDay: Number(value.closingDay),
    dueDay: Number(value.dueDay),
    paymentAccountId: value.paymentAccountId || undefined,
    openingStatementBalance: value.openingStatementBalance || "0",
    openingUnbilledBalance: value.openingUnbilledBalance || "0",
    preexistingPlans: value.preexistingPlans.map((plan) => ({
      description: plan.description,
      installmentAmount: plan.installmentAmount,
      nextInstallmentNumber: Number(plan.nextInstallmentNumber),
      installmentCount: Number(plan.installmentCount),
    })),
  };
}

interface CardFieldsProps {
  idPrefix: string;
  value: CardFieldsValue;
  onChange: (value: CardFieldsValue) => void;
  paymentAccounts: { id: string; name: string }[];
  errors?: FieldErrors;
  /** Las cuotas previas solo se cargan al crear la tarjeta. */
  showPreexisting?: boolean;
}

export function CardFields({ idPrefix, value, onChange, paymentAccounts, errors = {}, showPreexisting = true }: CardFieldsProps) {
  const set = <K extends keyof CardFieldsValue>(key: K, next: CardFieldsValue[K]) => onChange({ ...value, [key]: next });
  const setPlan = (index: number, patch: Partial<PreexistingPlanDraft>) =>
    set(
      "preexistingPlans",
      value.preexistingPlans.map((plan, i) => (i === index ? { ...plan, ...patch } : plan)),
    );
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField id={id("name")} label="Nombre" error={errors.name} className="col-span-2 sm:col-span-1">
          <Input id={id("name")} value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Visa Galicia" />
        </FormField>
        <FormField id={id("institution")} label="Banco (opcional)" error={errors.institution} className="col-span-2 sm:col-span-1">
          <Input id={id("institution")} value={value.institution} onChange={(e) => set("institution", e.target.value)} />
        </FormField>
        <FormField id={id("closing")} label="Día de cierre" error={errors.closingDay}>
          <Input id={id("closing")} inputMode="numeric" value={value.closingDay} onChange={(e) => set("closingDay", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="26" />
        </FormField>
        <FormField id={id("due")} label="Día de vencimiento" error={errors.dueDay}>
          <Input id={id("due")} inputMode="numeric" value={value.dueDay} onChange={(e) => set("dueDay", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="7" />
        </FormField>
        <FormField id={id("limit")} label="Límite (opcional)" error={errors.creditLimit} className="col-span-2">
          <MoneyInput id={id("limit")} value={value.creditLimit} onChange={(v) => set("creditLimit", v)} />
        </FormField>
      </div>

      {paymentAccounts.length > 0 && (
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Se paga desde</span>
          <ChoiceChips label="Cuenta de pago" value={value.paymentAccountId || null} options={paymentAccounts.map((a) => ({ value: a.id, label: a.name }))} onChange={(v) => set("paymentAccountId", v)} />
        </div>
      )}

      <div className="grid gap-3 rounded-2xl bg-secondary/60 p-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Deuda al empezar a registrar. No cuenta como gasto: ya ocurrió antes del inicio.
        </p>
        <FormField id={id("statement")} label="Saldo del último resumen sin pagar" error={errors.openingStatementBalance}>
          <MoneyInput id={id("statement")} value={value.openingStatementBalance} onChange={(v) => set("openingStatementBalance", v)} />
        </FormField>
        <FormField id={id("unbilled")} label="Consumos en un pago todavía no facturados" error={errors.openingUnbilledBalance}>
          <MoneyInput id={id("unbilled")} value={value.openingUnbilledBalance} onChange={(v) => set("openingUnbilledBalance", v)} />
        </FormField>

        {showPreexisting && (
          <div className="grid gap-3">
            <span className="text-[13px] font-semibold text-muted-foreground">Compras en cuotas en curso</span>
            {value.preexistingPlans.map((plan, index) => (
              <div key={index} className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3">
                <Input aria-label="Descripción" className="col-span-2" placeholder="Televisor" value={plan.description} onChange={(e) => setPlan(index, { description: e.target.value })} />
                <MoneyInput aria-label="Importe de la cuota" className="col-span-2" value={plan.installmentAmount} onChange={(v) => setPlan(index, { installmentAmount: v })} />
                <Input aria-label="Próxima cuota" inputMode="numeric" placeholder="Próxima cuota (ej. 4)" value={plan.nextInstallmentNumber} onChange={(e) => setPlan(index, { nextInstallmentNumber: e.target.value.replace(/\D/g, "") })} />
                <Input aria-label="Total de cuotas" inputMode="numeric" placeholder="De (ej. 12)" value={plan.installmentCount} onChange={(e) => setPlan(index, { installmentCount: e.target.value.replace(/\D/g, "") })} />
                <Button type="button" variant="ghost" size="sm" className="col-span-2 justify-self-end" onClick={() => set("preexistingPlans", value.preexistingPlans.filter((_, i) => i !== index))}>
                  <Trash2 /> Quitar
                </Button>
              </div>
            ))}
            {errors.preexistingPlans && <p className="text-[13px] font-medium text-negative">{errors.preexistingPlans}</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => set("preexistingPlans", [...value.preexistingPlans, { description: "", installmentAmount: "", nextInstallmentNumber: "", installmentCount: "" }])}
            >
              <Plus /> Agregar compra en cuotas
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
