"use client";

import { cn } from "cn";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capitalize, formatMonth, type YearMonth } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS } from "@/modules/accounts/rules";
import { PAYMENT_METHODS, TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from "../schema";

const selectClass = "h-11 w-full rounded-xl border border-input bg-card px-3 text-base md:text-[15px]";

const FILTER_KEYS = ["mes", "type", "categoryId", "accountId", "paymentMethod", "merchantId", "status"] as const;

export function TransactionFilters({ months }: { months: YearMonth[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data } = useReferenceData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(params.get("q") ?? "");

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    update("q", query.trim());
  }

  const active = FILTER_KEYS.filter((key) => params.get(key));
  const label = (key: (typeof FILTER_KEYS)[number], value: string): string => {
    switch (key) {
      case "mes":
        return capitalize(formatMonth(value));
      case "type":
        return TRANSACTION_TYPE_LABELS[value as keyof typeof TRANSACTION_TYPE_LABELS] ?? value;
      case "categoryId":
        return data?.categories.find((c) => c.id === value)?.name ?? "Categoría";
      case "accountId":
        return data?.accounts.find((a) => a.id === value)?.name ?? "Cuenta";
      case "paymentMethod":
        return PAYMENT_METHOD_LABELS[value as keyof typeof PAYMENT_METHOD_LABELS] ?? value;
      case "merchantId":
        return data?.merchants.find((m) => m.id === value)?.name ?? "Comercio";
      case "status":
        return value === "PENDING" ? "Pendientes" : "Confirmados";
    }
  };

  return (
    <div className="mb-5 grid gap-3">
      <div className="flex gap-2">
        <form onSubmit={onSearch} className="relative flex-1" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar movimientos"
            placeholder="Buscar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => query.trim() !== (params.get("q") ?? "") && update("q", query.trim())}
            className="pl-10"
          />
        </form>
        <Button variant="outline" size="icon" aria-label="Filtros" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(active.length > 0 && "border-primary")}>
          <SlidersHorizontal />
        </Button>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {active.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => update(key, "")}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-primary pr-2 pl-3 text-[13px] font-semibold text-primary-foreground"
            >
              {label(key, params.get(key)!)} <X className="size-3.5" aria-label="Quitar filtro" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
          <select aria-label="Período" className={selectClass} value={params.get("mes") ?? ""} onChange={(e) => update("mes", e.target.value)}>
            <option value="">Todos los meses</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {capitalize(formatMonth(month))}
              </option>
            ))}
          </select>
          <select aria-label="Tipo" className={selectClass} value={params.get("type") ?? ""} onChange={(e) => update("type", e.target.value)}>
            <option value="">Todos los tipos</option>
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TRANSACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <select aria-label="Categoría" className={selectClass} value={params.get("categoryId") ?? ""} onChange={(e) => update("categoryId", e.target.value)}>
            <option value="">Todas las categorías</option>
            {(["EXPENSE", "INCOME"] as const).map((kind) => (
              <optgroup key={kind} label={kind === "EXPENSE" ? "Gastos" : "Ingresos"}>
                {(data?.categories ?? [])
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? `   ${c.name}` : c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <select aria-label="Cuenta" className={selectClass} value={params.get("accountId") ?? ""} onChange={(e) => update("accountId", e.target.value)}>
            <option value="">Todas las cuentas</option>
            {(data?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select aria-label="Medio de pago" className={selectClass} value={params.get("paymentMethod") ?? ""} onChange={(e) => update("paymentMethod", e.target.value)}>
            <option value="">Todos los medios de pago</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
          <select aria-label="Comercio" className={selectClass} value={params.get("merchantId") ?? ""} onChange={(e) => update("merchantId", e.target.value)}>
            <option value="">Todos los comercios</option>
            {(data?.merchants ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select aria-label="Estado" className={selectClass} value={params.get("status") ?? ""} onChange={(e) => update("status", e.target.value)}>
            <option value="">Confirmados y pendientes</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="PENDING">Pendientes</option>
          </select>
        </div>
      )}
    </div>
  );
}
