import { cn } from "cn";
import { ArrowLeftRight, CreditCard, SlidersHorizontal } from "lucide-react";
import { Amount } from "@/components/amount";
import { parseDecimal } from "@/lib/money";
import { CategoryChip } from "@/modules/categories/components/category-chip";
import type { TransactionDTO } from "../schema";

function subtitle(t: TransactionDTO): string {
  switch (t.type) {
    case "TRANSFER":
    case "CARD_PAYMENT":
      return `${t.account.name} → ${t.toAccount?.name ?? ""}`;
    case "ADJUSTMENT":
      return `Ajuste · ${t.account.name}`;
    default: {
      const category = t.category ? (t.category.parentName ? `${t.category.parentName} › ${t.category.name}` : t.category.name) : "";
      return [category, t.account.name].filter(Boolean).join(" · ");
    }
  }
}

function TypeIcon({ type }: { type: TransactionDTO["type"] }) {
  const Icon = type === "CARD_PAYMENT" ? CreditCard : type === "ADJUSTMENT" ? SlidersHorizontal : ArrowLeftRight;
  return (
    <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
      <Icon className="size-[1.1rem]" />
    </span>
  );
}

export function TransactionAmount({ t, className }: { t: TransactionDTO; className?: string }) {
  if (t.type === "INCOME") return <Amount value={t.amount} sign="always" tone="positive" className={className} />;
  if (t.type === "EXPENSE") return <Amount value={`-${t.amount}`} className={className} />;
  if (t.type === "ADJUSTMENT") return <Amount value={t.amount} sign="always" tone="muted" className={className} />;
  return <Amount value={t.amount} tone="muted" className={className} />;
}

export function TransactionRow({ t, onSelect }: { t: TransactionDTO; onSelect?: () => void }) {
  const pending = t.status === "PENDING";
  const content = (
    <>
      {t.category ? <CategoryChip icon={t.category.icon} color={t.category.color} /> : <TypeIcon type={t.type} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{t.description}</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {pending && <span className="mr-1.5 font-semibold text-warning">Pendiente ·</span>}
          {subtitle(t)}
          {t.installments && ` · ${t.installments.count} cuotas`}
        </p>
      </div>
      <div className="text-right">
        <TransactionAmount t={t} className={cn("text-[15px] font-semibold", pending && "opacity-60")} />
        {t.installments && (
          <p className="text-[12px] text-muted-foreground">
            {t.installments.count} × <Amount value={t.installments.amountEach} tone="muted" />
          </p>
        )}
      </div>
    </>
  );
  if (!onSelect) return <div className="flex items-center gap-3 px-4 py-3">{content}</div>;
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50">
      {content}
    </button>
  );
}

/** Para totales rápidos de una lista (no reemplaza los informes). */
export function signedFlow(t: TransactionDTO): bigint {
  const amount = parseDecimal(t.amount);
  if (t.status !== "CONFIRMED") return 0n;
  return t.type === "INCOME" ? amount : t.type === "EXPENSE" ? -amount : 0n;
}
