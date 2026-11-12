"use client";

import { cn } from "cn";
import { AlertTriangle, Info, Loader2, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryTree, useReferenceData } from "@/components/app-shell/reference-data";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api-client";
import { todayIn } from "@/lib/dates";
import { formatMoney, parseDecimal } from "@/lib/money";
import { isCard } from "@/modules/accounts/rules";
import { confirmVoice } from "../client";
import type { ConfirmVoiceInput, VoiceDraft, VoiceEntryDTO } from "../schema";

interface DraftState {
  key: string;
  include: boolean;
  type: "EXPENSE" | "INCOME";
  amount: string;
  date: string;
  accountId: string;
  categoryId: string;
  description: string;
  merchantName: string;
  installments: number;
}

type DraftErrors = Partial<Record<keyof DraftState, string>>;

function initialState(draft: VoiceDraft): DraftState {
  return {
    key: draft.key,
    include: true,
    type: draft.type,
    amount: draft.amount ?? "",
    date: draft.date,
    accountId: draft.accountId ?? "",
    categoryId: draft.categoryId ?? "",
    description: draft.description ?? "",
    merchantName: draft.merchantName ?? "",
    installments: draft.installments ?? 1,
  };
}

function validateDraft(state: DraftState, today: string): DraftErrors {
  const errors: DraftErrors = {};
  if (!state.amount || parseDecimal(state.amount) <= 0n) errors.amount = "Ingresá el importe.";
  if (!state.categoryId) errors.categoryId = "Elegí una categoría.";
  if (!state.accountId) errors.accountId = state.type === "INCOME" ? "Elegí dónde se acreditó." : "Elegí con qué pagaste.";
  if (!state.date) errors.date = "Elegí la fecha.";
  else if (state.date > today) errors.date = "La fecha no puede ser futura.";
  return errors;
}

interface VoiceReviewProps {
  entry: VoiceEntryDTO;
  onSaved: (entry: VoiceEntryDTO) => void;
  onDiscard: () => Promise<void>;
  /** Texto dictado con el reconocimiento del navegador (llega como texto, pero se dijo). */
  dictated?: boolean;
}

/** Borradores para revisar y confirmar. Nada se guarda hasta tocar «Guardar». */
export function VoiceReview({ entry, onSaved, onDiscard, dictated = false }: VoiceReviewProps) {
  const { data } = useReferenceData();
  const [drafts, setDrafts] = useState(() => entry.drafts.map(initialState));
  const [errors, setErrors] = useState<Record<string, DraftErrors>>({});
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const today = todayIn(data?.user.timezone);
  const included = drafts.filter((draft) => draft.include);

  function update(key: string, patch: Partial<DraftState>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
    setErrors((current) => {
      const next = { ...current[key] };
      for (const field of Object.keys(patch)) delete next[field as keyof DraftState];
      return { ...current, [key]: next };
    });
  }

  async function save() {
    setFormError(null);
    const found: Record<string, DraftErrors> = {};
    for (const draft of included) {
      const draftErrors = validateDraft(draft, today);
      if (Object.keys(draftErrors).length) found[draft.key] = draftErrors;
    }
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Completá los datos marcados.");
      return;
    }
    const accounts = data?.accounts ?? [];
    const input: ConfirmVoiceInput = {
      items: included.map((draft) => {
        const account = accounts.find((a) => a.id === draft.accountId);
        return {
          key: draft.key,
          type: draft.type,
          amount: draft.amount,
          date: draft.date,
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          description: draft.description.trim() || undefined,
          merchantName: draft.merchantName.trim() || undefined,
          installments: draft.type === "EXPENSE" && account && isCard(account.type) && draft.installments > 1 ? draft.installments : undefined,
        };
      }),
    };
    setSaving(true);
    try {
      onSaved(await confirmVoice(entry.id, input));
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        const serverErrors: Record<string, DraftErrors> = {};
        for (const [path, message] of Object.entries(error.fields)) {
          const [, index, field] = path.split(".");
          const draft = included[Number(index)];
          if (draft && field) serverErrors[draft.key] = { ...serverErrors[draft.key], [field]: message };
        }
        setErrors(serverErrors);
        setFormError(error.message);
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      {entry.transcript && (
        <figure className="rounded-2xl bg-secondary px-4 py-3">
          <figcaption className="mb-1 text-[12px] font-semibold text-muted-foreground">{entry.inputType === "AUDIO" || dictated ? "Escuchamos" : "Escribiste"}</figcaption>
          <blockquote className="text-[15px] leading-snug">«{entry.transcript}»</blockquote>
        </figure>
      )}

      {entry.interpreter?.fallback && (
        <Notice tone="info">La interpretación avanzada no respondió: se usó la básica. Revisá cada dato.</Notice>
      )}
      {entry.notices.map((notice) => (
        <Notice key={notice} tone="warning">
          {notice}
        </Notice>
      ))}

      {drafts.map((draft, index) => (
        <DraftCard
          key={draft.key}
          index={index}
          state={draft}
          source={entry.drafts.find((d) => d.key === draft.key)!}
          errors={errors[draft.key] ?? {}}
          today={today}
          onChange={(patch) => update(draft.key, patch)}
        />
      ))}

      {formError && (
        <p role="alert" className="text-[14px] font-medium text-negative">
          {formError}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-5 grid gap-2 border-t bg-popover px-5 pt-3 pb-1">
        <Button size="lg" onClick={save} disabled={saving || discarding || included.length === 0}>
          {saving && <Loader2 className="animate-spin" />}
          {included.length === 0
            ? "No hay movimientos para guardar"
            : included.length === 1
              ? "Guardar 1 movimiento"
              : `Guardar ${included.length} movimientos`}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            setDiscarding(true);
            try {
              await onDiscard();
            } finally {
              setDiscarding(false);
            }
          }}
          disabled={saving || discarding}
        >
          Descartar todo
        </Button>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <p className={cn("flex gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-snug", tone === "warning" ? "bg-warning-soft text-foreground" : "bg-secondary text-muted-foreground")}>
      <Icon className={cn("mt-px size-4 shrink-0", tone === "warning" && "text-warning")} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

interface DraftCardProps {
  index: number;
  state: DraftState;
  source: VoiceDraft;
  errors: DraftErrors;
  today: string;
  onChange: (patch: Partial<DraftState>) => void;
}

function DraftCard({ index, state, source, errors, today, onChange }: DraftCardProps) {
  const { data } = useReferenceData();
  const id = (field: string) => `voice-${state.key}-${field}`;
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => a.isActive && (state.type === "EXPENSE" || !isCard(a.type))), [data, state.type]);
  const tree = useMemo(() => categoryTree(data?.categories ?? [], state.type), [data, state.type]);
  const account = accounts.find((a) => a.id === state.accountId);
  const label = `Movimiento ${index + 1}`;

  if (!state.include) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3 text-muted-foreground">
        <span className="text-[14px]">
          {label} quitado{source.amount ? ` · ${formatMoney(parseDecimal(source.amount))}` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange({ include: true })}>
          <RotateCcw /> Volver a incluir
        </Button>
      </div>
    );
  }

  return (
    <fieldset aria-label={label} className="grid min-w-0 gap-3.5 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <legend className="float-left text-[15px] font-bold">{label}</legend>
        <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${label.toLowerCase()}`} onClick={() => onChange({ include: false })}>
          <X />
        </Button>
      </div>

      {source.quote && <p className="-mt-2 text-[13px] text-muted-foreground italic">«{source.quote}»</p>}

      {source.issues.length > 0 && (
        <ul aria-label="Para revisar" className="grid gap-1.5 rounded-xl bg-warning-soft px-3 py-2.5">
          {source.issues.map((issue) => (
            <li key={issue.code + issue.message} className="flex gap-2 text-[13px] leading-snug">
              <AlertTriangle className="mt-px size-4 shrink-0 text-warning" aria-hidden="true" />
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {source.notes.length > 0 && (
        <ul className="grid gap-1 text-[13px] text-muted-foreground">
          {source.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}

      <ChoiceChips
        label={`Tipo del ${label.toLowerCase()}`}
        value={state.type}
        options={[
          { value: "EXPENSE", label: "Gasto" },
          { value: "INCOME", label: "Ingreso" },
        ]}
        onChange={(type) => {
          const keepAccount = type === "EXPENSE" || !account || !isCard(account.type);
          onChange({ type, categoryId: "", ...(keepAccount ? {} : { accountId: "" }) });
        }}
      />

      <FormField id={id("amount")} label="Importe" error={errors.amount}>
        <MoneyInput id={id("amount")} aria-invalid={!!errors.amount} value={state.amount} onChange={(amount) => onChange({ amount })} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id={id("description")} label="Descripción" error={errors.description}>
          <Input id={id("description")} value={state.description} maxLength={140} onChange={(e) => onChange({ description: e.target.value })} />
        </FormField>
        <FormField id={id("merchantName")} label={state.type === "INCOME" ? "Origen" : "Comercio"} error={errors.merchantName}>
          <Input id={id("merchantName")} value={state.merchantName} maxLength={80} onChange={(e) => onChange({ merchantName: e.target.value })} />
        </FormField>
      </div>

      <FormField id={id("categoryId")} label="Categoría" error={errors.categoryId}>
        <select
          id={id("categoryId")}
          aria-invalid={!!errors.categoryId}
          value={state.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
          className="h-11 rounded-xl border border-input bg-card px-3 text-base aria-invalid:border-destructive md:text-[15px]"
        >
          <option value="">Elegí una categoría</option>
          {tree.map((node) =>
            node.children.length ? (
              <optgroup key={node.id} label={node.name}>
                <option value={node.id}>{node.name} (general)</option>
                {node.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ),
          )}
        </select>
      </FormField>

      <div className="grid gap-1.5">
        <span className="text-[13px] font-semibold text-muted-foreground">{state.type === "INCOME" ? "Se acredita en" : "Pagado con"}</span>
        <ChoiceChips
          label={`Cuenta del ${label.toLowerCase()}`}
          value={state.accountId || null}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          onChange={(accountId) => onChange({ accountId })}
        />
        {errors.accountId && (
          <p role="alert" className="text-[13px] font-medium text-negative">
            {errors.accountId}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField id={id("date")} label="Fecha" error={errors.date}>
          <Input id={id("date")} type="date" max={today} aria-invalid={!!errors.date} value={state.date} onChange={(e) => onChange({ date: e.target.value })} />
        </FormField>
        {state.type === "EXPENSE" && account && isCard(account.type) && (
          <FormField id={id("installments")} label="Cuotas">
            <select
              id={id("installments")}
              value={state.installments}
              onChange={(e) => onChange({ installments: Number(e.target.value) })}
              className="h-11 rounded-xl border border-input bg-card px-3 text-base md:text-[15px]"
            >
              {[1, 2, 3, 4, 5, 6, 9, 10, 12, 18, 24].concat(state.installments > 1 && ![2, 3, 4, 5, 6, 9, 10, 12, 18, 24].includes(state.installments) ? [state.installments] : []).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 pago" : `${n} cuotas`}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>
    </fieldset>
  );
}
