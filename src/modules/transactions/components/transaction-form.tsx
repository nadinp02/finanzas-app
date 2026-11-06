"use client";

import { cn } from "cn";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { categoryTree, useReferenceData } from "@/components/app-shell/reference-data";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethod, TransactionType } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api-client";
import { addDays, todayIn } from "@/lib/dates";
import { normalizeText } from "@/lib/text";
import { isCard, PAYMENT_METHOD_LABELS } from "@/modules/accounts/rules";
import { CategoryChip } from "@/modules/categories/components/category-chip";
import {
  PAYMENT_METHODS,
  transactionInputSchema,
  type TransactionDraft,
  type TransactionDTO,
  type TransactionInput,
} from "../schema";

export interface TransactionFormValues {
  type: TransactionType;
  amount: string;
  date: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  merchantName: string;
  description: string;
  notes: string;
  isFixed: boolean;
  paymentMethod: PaymentMethod | "";
  installments: number;
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "EXPENSE", label: "Gasto" },
  { value: "INCOME", label: "Ingreso" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD_PAYMENT", label: "Pago de tarjeta" },
];

const SUBMIT_LABELS: Record<TransactionType, string> = {
  EXPENSE: "Guardar gasto",
  INCOME: "Guardar ingreso",
  TRANSFER: "Guardar transferencia",
  CARD_PAYMENT: "Guardar pago",
  ADJUSTMENT: "Guardar ajuste",
};

export function valuesFromTransaction(transaction: TransactionDTO): TransactionFormValues {
  return {
    type: transaction.type,
    amount: transaction.amount,
    date: transaction.date,
    accountId: transaction.account.id,
    toAccountId: transaction.toAccount?.id ?? "",
    categoryId: transaction.category?.id ?? "",
    merchantName: transaction.merchant?.name ?? "",
    description: transaction.merchant && transaction.description === transaction.merchant.name ? "" : transaction.description,
    notes: transaction.notes ?? "",
    isFixed: transaction.isFixed,
    paymentMethod: transaction.paymentMethod ?? "",
    installments: transaction.installments?.count ?? 1,
  };
}

/** Convierte los valores planos del formulario en la entrada validable por tipo. */
export function toTransactionInput(values: TransactionFormValues): unknown {
  const base = {
    amount: values.amount,
    date: values.date,
    accountId: values.accountId,
    description: values.description,
    notes: values.notes,
  };
  switch (values.type) {
    case "EXPENSE":
    case "INCOME":
      return {
        ...base,
        type: values.type,
        categoryId: values.categoryId,
        merchantName: values.merchantName,
        isFixed: values.isFixed,
        paymentMethod: values.paymentMethod || undefined,
        ...(values.type === "EXPENSE" && values.installments > 1 && { installments: values.installments }),
      };
    case "TRANSFER":
    case "CARD_PAYMENT":
      return { ...base, type: values.type, toAccountId: values.toAccountId };
    case "ADJUSTMENT":
      return { ...base, type: "ADJUSTMENT" };
  }
}

interface TransactionFormProps {
  initial: TransactionFormValues;
  mode: "create" | "edit";
  onSubmit: (input: TransactionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function defaultFormValues(draft: TransactionDraft | undefined, defaultAccountId: string | null, timezone: string): TransactionFormValues {
  return {
    type: draft?.type ?? "EXPENSE",
    amount: draft?.amount ?? "",
    date: draft?.date ?? todayIn(timezone),
    accountId: draft?.accountId ?? defaultAccountId ?? "",
    toAccountId: draft?.toAccountId ?? "",
    categoryId: draft?.categoryId ?? "",
    merchantName: draft?.merchantName ?? "",
    description: draft?.description ?? "",
    notes: "",
    isFixed: false,
    paymentMethod: "",
    installments: 1,
  };
}

export function TransactionForm({ initial, mode, onSubmit, onDelete }: TransactionFormProps) {
  const { data } = useReferenceData();
  const form = useForm<TransactionFormValues>({ defaultValues: initial });
  const { errors, isSubmitting } = form.formState;
  const [moreOpen, setMoreOpen] = useState(mode === "edit" && Boolean(initial.notes || initial.description));
  const [deleting, setDeleting] = useState(false);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  const [type, accountId, toAccountId, categoryId, merchantName, date] = useWatch({
    control: form.control,
    name: ["type", "accountId", "toAccountId", "categoryId", "merchantName", "date"],
  });
  const isFlow = type === "EXPENSE" || type === "INCOME";

  const timezone = data?.user.timezone ?? "America/Argentina/Cordoba";
  const today = todayIn(timezone);
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => a.isActive || a.id === initial.accountId || a.id === initial.toAccountId), [data, initial]);
  const assets = accounts.filter((a) => !isCard(a.type));
  const cards = accounts.filter((a) => isCard(a.type));
  const sourceAccounts = type === "EXPENSE" ? accounts : assets;
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const tree = useMemo(() => (isFlow ? categoryTree(data?.categories ?? [], type) : []), [data, isFlow, type]);
  const categoryById = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const selectedCategory = categoryById.get(categoryId);
  const selectedParentId = selectedCategory?.parentId ?? selectedCategory?.id ?? null;
  const openParent = expandedParent ?? selectedParentId;

  const merchantSuggestions = useMemo(() => {
    const query = normalizeText(merchantName);
    const merchants = data?.merchants ?? [];
    if (!query) return merchants.slice(0, 6);
    return merchants.filter((m) => normalizeText(m.name).includes(query) && normalizeText(m.name) !== query).slice(0, 6);
  }, [data, merchantName]);

  function pickCategory(id: string) {
    form.setValue("categoryId", id, { shouldDirty: true });
    form.clearErrors("categoryId");
    const category = categoryById.get(id);
    if (category) form.setValue("isFixed", category.isFixedDefault);
  }

  function pickMerchant(name: string, defaultCategoryId: string | null) {
    form.setValue("merchantName", name, { shouldDirty: true });
    // La categoría habitual del comercio se aplica si todavía no se eligió otra.
    if (defaultCategoryId && !form.getValues("categoryId")) {
      const category = categoryById.get(defaultCategoryId);
      if (category?.kind === form.getValues("type")) pickCategory(defaultCategoryId);
    }
  }

  const submit = form.handleSubmit(async (values) => {
    const parsed = transactionInputSchema.safeParse(toTransactionInput(values));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "amount") as keyof TransactionFormValues;
        if (!form.getFieldState(field).error) form.setError(field, { message: issue.message });
      }
      return;
    }
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      // Reglas que solo el servidor puede verificar (apertura de cuentas, cuentas desactivadas).
      if (error instanceof ApiError && error.fields) {
        for (const [field, message] of Object.entries(error.fields)) {
          form.setError(field as keyof TransactionFormValues, { message });
        }
        return;
      }
      throw error;
    }
  });

  const dateOptions = [
    { value: today, label: "Hoy" },
    { value: addDays(today, -1), label: "Ayer" },
    { value: addDays(today, -2), label: "Anteayer" },
  ];
  const customDate = !dateOptions.some((option) => option.value === date);

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      {mode === "create" || type !== "ADJUSTMENT" ? (
        <ChoiceChips
          label="Tipo de movimiento"
          value={type}
          options={type === "ADJUSTMENT" ? [...TYPE_OPTIONS, { value: "ADJUSTMENT", label: "Ajuste" }] : TYPE_OPTIONS}
          onChange={(next) => {
            form.setValue("type", next);
            form.setValue("categoryId", "");
            form.setValue("toAccountId", "");
            form.clearErrors();
            if (next !== "EXPENSE" && selectedAccount && isCard(selectedAccount.type)) form.setValue("accountId", "");
          }}
        />
      ) : null}

      <div>
        <Controller
          control={form.control}
          name="amount"
          render={({ field }) => (
            <MoneyInput
              size="hero"
              aria-label="Importe"
              aria-invalid={!!errors.amount}
              autoFocus={mode === "create"}
              allowNegative={type === "ADJUSTMENT"}
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                form.clearErrors("amount");
              }}
            />
          )}
        />
        {errors.amount && <p role="alert" className="mt-1 text-[13px] font-medium text-negative">{errors.amount.message}</p>}
      </div>

      {isFlow && (
        <div className="grid gap-2">
          <FormField id="merchantName" label={type === "INCOME" ? "Origen (opcional)" : "Comercio (opcional)"}>
            <Input id="merchantName" autoComplete="off" placeholder={type === "INCOME" ? "Empresa, cliente…" : "Farmacity, Coto…"} {...form.register("merchantName")} />
          </FormField>
          {merchantSuggestions.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {merchantSuggestions.map((merchant) => (
                <button
                  key={merchant.id}
                  type="button"
                  onClick={() => pickMerchant(merchant.name, merchant.defaultCategoryId)}
                  className="h-8 shrink-0 rounded-full bg-secondary px-3 text-[13px] font-semibold text-secondary-foreground hover:bg-accent"
                >
                  {merchant.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isFlow && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">Categoría</legend>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5">
            {tree.map((node) => {
              const selected = selectedParentId === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    pickCategory(node.id);
                    setExpandedParent(node.children.length ? node.id : null);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center text-[12px] leading-tight font-semibold transition-colors",
                    selected ? "bg-accent text-foreground ring-2 ring-primary" : "text-muted-foreground hover:bg-accent/60",
                  )}
                >
                  <CategoryChip icon={node.icon} color={node.color} />
                  <span className="line-clamp-2">{node.name}</span>
                </button>
              );
            })}
          </div>
          {openParent && (tree.find((n) => n.id === openParent)?.children.length ?? 0) > 0 && (
            <ChoiceChips
              label="Subcategoría"
              value={categoryId}
              options={[
                { value: openParent, label: "General" },
                ...tree.find((n) => n.id === openParent)!.children.map((child) => ({ value: child.id, label: child.name })),
              ]}
              onChange={pickCategory}
            />
          )}
          {errors.categoryId && <p role="alert" className="text-[13px] font-medium text-negative">{errors.categoryId.message}</p>}
        </fieldset>
      )}

      <div className="grid gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">
          {type === "INCOME" ? "Se acredita en" : type === "TRANSFER" || type === "CARD_PAYMENT" ? "Sale de" : "Pagado con"}
        </span>
        <ChoiceChips
          label="Cuenta"
          value={accountId || null}
          options={(type === "ADJUSTMENT" ? accounts : sourceAccounts).map((a) => ({ value: a.id, label: a.name }))}
          onChange={(value) => {
            form.setValue("accountId", value);
            form.clearErrors("accountId");
            const account = accounts.find((a) => a.id === value);
            if (!account || !isCard(account.type)) form.setValue("installments", 1);
          }}
        />
        {errors.accountId && <p role="alert" className="text-[13px] font-medium text-negative">{errors.accountId.message}</p>}
        {accounts.length === 0 && <p className="text-[13px] text-muted-foreground">Primero creá una cuenta en Cuentas.</p>}
      </div>

      {(type === "TRANSFER" || type === "CARD_PAYMENT") && (
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">{type === "TRANSFER" ? "Hacia" : "Tarjeta"}</span>
          <ChoiceChips
            label="Cuenta destino"
            value={toAccountId || null}
            options={(type === "TRANSFER" ? assets.filter((a) => a.id !== accountId) : cards).map((a) => ({ value: a.id, label: a.name }))}
            onChange={(value) => {
              form.setValue("toAccountId", value);
              form.clearErrors("toAccountId");
            }}
          />
          {errors.toAccountId && <p role="alert" className="text-[13px] font-medium text-negative">{errors.toAccountId.message}</p>}
          {type === "CARD_PAYMENT" && cards.length === 0 && <p className="text-[13px] text-muted-foreground">No tenés tarjetas cargadas.</p>}
        </div>
      )}

      {type === "EXPENSE" && selectedAccount && isCard(selectedAccount.type) && (
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Cuotas</span>
          <Controller
            control={form.control}
            name="installments"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <ChoiceChips
                  label="Cuotas"
                  value={field.value}
                  options={[1, 3, 6, 12].map((n) => ({ value: n, label: n === 1 ? "1 pago" : `${n}` }))}
                  onChange={field.onChange}
                  className="flex-1"
                />
                <Input
                  aria-label="Otra cantidad de cuotas"
                  inputMode="numeric"
                  className="w-20 shrink-0 text-center"
                  placeholder="Otra"
                  value={[1, 3, 6, 12].includes(field.value) ? "" : String(field.value)}
                  onChange={(event) => {
                    const count = Number(event.target.value.replace(/\D/g, ""));
                    field.onChange(count >= 1 ? Math.min(count, 72) : 1);
                  }}
                />
              </div>
            )}
          />
          {errors.installments && <p role="alert" className="text-[13px] font-medium text-negative">{errors.installments.message}</p>}
        </div>
      )}

      <div className="grid gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">Fecha</span>
        <div className="flex items-center gap-2">
          <ChoiceChips label="Fecha" value={customDate ? null : date} options={dateOptions} onChange={(value) => form.setValue("date", value)} className="flex-1" />
          <Input
            type="date"
            aria-label="Otra fecha"
            max={today}
            className={cn("w-[9.5rem] shrink-0", customDate && "border-primary")}
            value={date}
            onChange={(event) => event.target.value && form.setValue("date", event.target.value)}
          />
        </div>
        {errors.date && <p role="alert" className="text-[13px] font-medium text-negative">{errors.date.message}</p>}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground"
          aria-expanded={moreOpen}
        >
          Más opciones <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
        </button>
        {moreOpen && (
          <div className="mt-4 grid gap-4">
            <FormField id="description" label="Descripción" error={errors.description?.message}>
              <Input id="description" placeholder="Opcional" {...form.register("description")} />
            </FormField>
            {isFlow && (
              <label className="flex items-center justify-between gap-4 rounded-xl border bg-card px-3.5 py-3">
                <span>
                  <span className="block text-[15px] font-semibold">{type === "INCOME" ? "Ingreso fijo" : "Gasto fijo"}</span>
                  <span className="block text-[13px] text-muted-foreground">Se repite todos los meses (alquiler, sueldo, servicios).</span>
                </span>
                <Controller
                  control={form.control}
                  name="isFixed"
                  render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                />
              </label>
            )}
            {isFlow && selectedAccount && !isCard(selectedAccount.type) && (
              <FormField id="paymentMethod" label="Medio de pago">
                <select
                  id="paymentMethod"
                  className="h-11 rounded-xl border border-input bg-card px-3 text-base md:text-[15px]"
                  {...form.register("paymentMethod")}
                >
                  <option value="">Automático según la cuenta</option>
                  {PAYMENT_METHODS.filter((m) => m !== "CREDIT_CARD").map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField id="notes" label="Notas" error={errors.notes?.message}>
              <Textarea id="notes" rows={2} {...form.register("notes")} />
            </FormField>
          </div>
        )}
      </div>

      <div className="grid gap-2 pt-1">
        <Button type="submit" size="lg" disabled={isSubmitting || deleting} className="w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          {mode === "edit" ? "Guardar cambios" : SUBMIT_LABELS[type]}
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="lg"
            disabled={isSubmitting || deleting}
            onClick={async () => {
              if (!window.confirm("¿Eliminar este movimiento? Los saldos se recalculan.")) return;
              setDeleting(true);
              try {
                await onDelete();
              } finally {
                setDeleting(false);
              }
            }}
          >
            <Trash2 /> Eliminar movimiento
          </Button>
        )}
      </div>
    </form>
  );
}
