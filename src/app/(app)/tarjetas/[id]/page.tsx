import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { Card, PageHeader, Section } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { capitalize, formatMonth, formatShortDate, todayIn } from "@/lib/dates";
import { parseDecimal } from "@/lib/money";
import { CardDetailActions, PayStatementButton } from "@/modules/cards/components/card-actions";
import type { StatementDTO } from "@/modules/cards/schema";
import { getCardStatus } from "@/modules/cards/service";
import { TransactionFeed } from "@/modules/transactions/components/transaction-feed";
import { listTransactions } from "@/modules/transactions/service";
import { requireOnboardedUser } from "@/server/auth";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Tarjeta" };

const STATUS_LABELS: Record<StatementDTO["status"], string> = {
  paid: "Pagado",
  partial: "Pago parcial",
  unpaid: "A pagar",
  overdue: "Vencido",
  "no-balance": "Sin saldo",
};

export default function CardPage({ params }: PageProps<"/tarjetas/[id]">) {
  return (
    <>
      <Link href="/cuentas" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="size-4" /> Cuentas
      </Link>
      <Suspense fallback={<Skeleton className="mt-6 h-96 rounded-2xl" />}>
        <CardDetail params={params} />
      </Suspense>
    </>
  );
}

async function CardDetail({ params }: Pick<PageProps<"/tarjetas/[id]">, "params">) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const today = todayIn(user.timezone);
  const card = await getCardStatus(user.id, id, today).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const { items, nextCursor } = await listTransactions(user.id, { accountId: id, limit: 30 });
  const statement = card.lastStatement;
  const remaining = statement ? parseDecimal(statement.remaining) : 0n;

  return (
    <>
      <PageHeader eyebrow={card.institution ?? "Tarjeta de crédito"} title={card.name} />

      <Card className="p-5">
        {statement && remaining > 0n ? (
          <>
            <p className={cn("text-sm font-semibold", statement.status === "overdue" ? "text-negative" : "text-muted-foreground")}>
              {statement.status === "overdue" ? "Vencido" : "A pagar"} · resumen de {formatMonth(statement.period)} · vence {formatShortDate(statement.dueDate)}
            </p>
            <Amount value={statement.remaining} className="mt-1 block text-[36px] leading-tight font-bold" />
            {parseDecimal(statement.paid) > 0n && (
              <p className="text-[13px] text-muted-foreground">
                Ya pagaste <Amount value={statement.paid} tone="muted" /> de <Amount value={statement.balance} tone="muted" />
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted-foreground">Nada para pagar ahora</p>
            {statement && parseDecimal(statement.creditBalance) > 0n && (
              <p className="mt-1 text-[15px]">
                Saldo a favor: <Amount value={statement.creditBalance} tone="positive" className="font-semibold" />
              </p>
            )}
          </>
        )}
        <div className="mt-4">
          <PayStatementButton card={card} />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">Próximo resumen</p>
          <Amount value={card.currentPeriod.charges} className="mt-1 block text-[20px] font-bold" />
          <p className="text-[12px] text-muted-foreground">
            Cierra {formatShortDate(card.currentPeriod.closingDate)} · vence {formatShortDate(card.currentPeriod.dueDate)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">Cuotas futuras</p>
          <Amount value={card.futureInstallments} className="mt-1 block text-[20px] font-bold" />
          <p className="text-[12px] text-muted-foreground">Después del próximo resumen</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">Deuda total</p>
          <Amount value={card.totalDebt} className="mt-1 block text-[20px] font-bold" />
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">Límite disponible</p>
          {card.availableLimit ? (
            <Amount value={card.availableLimit} className="mt-1 block text-[20px] font-bold" />
          ) : (
            <p className="mt-1 text-[15px] text-muted-foreground">Sin límite cargado</p>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <CardDetailActions card={card} />
      </div>

      {card.plans.length > 0 && (
        <Section title="Compras en cuotas">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {card.plans.map((plan) => (
              <div key={plan.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{plan.description}</p>
                  <p className="text-[13px] text-muted-foreground">
                    Cuota {plan.billedCount} de {plan.installmentCount} · <Amount value={plan.installmentAmount} tone="muted" /> por mes
                  </p>
                </div>
                <div className="text-right">
                  <Amount value={plan.remainingAmount} className="text-[15px] font-semibold" />
                  <p className="text-[12px] text-muted-foreground">restan</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {card.statements.length > 0 && (
        <Section title="Resúmenes">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {card.statements.slice(0, 12).map((s) => (
              <div key={s.period} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{capitalize(formatMonth(s.period))}</p>
                  <p className="text-[13px] text-muted-foreground">
                    Cerró {formatShortDate(s.closingDate)} · venció {formatShortDate(s.dueDate)}
                  </p>
                </div>
                <div className="text-right">
                  <Amount value={s.balance} className="text-[15px] font-semibold" />
                  <p className={cn("text-[12px] font-semibold", s.status === "overdue" ? "text-negative" : s.status === "paid" ? "text-positive" : "text-muted-foreground")}>
                    {STATUS_LABELS[s.status]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Movimientos">
        <TransactionFeed initialItems={items} initialCursor={nextCursor} query={`accountId=${id}&limit=30`} today={today} />
      </Section>
    </>
  );
}
