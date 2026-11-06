import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { Card, PageHeader, Section } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate, todayIn } from "@/lib/dates";
import { parseDecimal, sumCents } from "@/lib/money";
import { NewAccountButtons } from "@/modules/accounts/components/account-actions";
import { AccountIcon } from "@/modules/accounts/components/account-icon";
import { ACCOUNT_TYPE_LABELS } from "@/modules/accounts/rules";
import { listAccounts } from "@/modules/accounts/service";
import type { CardStatusDTO } from "@/modules/cards/schema";
import { listCardStatuses } from "@/modules/cards/service";
import { requireOnboardedUser } from "@/server/auth";

export const metadata: Metadata = { title: "Cuentas" };

export default function AccountsPage() {
  return (
    <>
      <PageHeader title="Cuentas" actions={<NewAccountButtons />} />
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <AccountsContent />
      </Suspense>
    </>
  );
}

function cardSummary(card: CardStatusDTO): string {
  const statement = card.lastStatement;
  if (statement && parseDecimal(statement.remaining) > 0n) {
    return statement.status === "overdue" ? `Vencido el ${formatShortDate(statement.dueDate)}` : `A pagar · vence ${formatShortDate(statement.dueDate)}`;
  }
  return `Cierra el ${formatShortDate(card.currentPeriod.closingDate)}`;
}

async function AccountsContent() {
  const user = await requireOnboardedUser();
  const today = todayIn(user.timezone);
  const [accounts, cards] = await Promise.all([listAccounts(user.id, today), listCardStatuses(user.id, today)]);
  const assets = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const available = sumCents(assets.map((a) => parseDecimal(a.balance)));
  const debt = sumCents(cards.map((c) => parseDecimal(c.totalDebt)));
  const active = assets.filter((a) => a.isActive);
  const inactive = assets.filter((a) => !a.isActive);

  return (
    <>
      <Card className="grid grid-cols-3 divide-x p-0">
        {[
          { label: "Disponible", value: available, tone: "default" as const },
          { label: "Deuda tarjetas", value: -debt, tone: debt > 0n ? ("negative" as const) : ("muted" as const) },
          { label: "Patrimonio", value: available - debt, tone: "default" as const },
        ].map((item) => (
          <div key={item.label} className="px-3 py-4 text-center">
            <p className="text-[12px] font-semibold text-muted-foreground">{item.label}</p>
            <Amount value={item.value} tone={item.tone} decimals="never" className="mt-1 block text-[17px] font-bold" />
          </div>
        ))}
      </Card>

      <Section title="Cuentas" className="mt-8">
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {active.map((account) => (
            <Link key={account.id} href={`/cuentas/${account.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50">
              <AccountIcon type={account.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{account.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">{account.institution ?? ACCOUNT_TYPE_LABELS[account.type as keyof typeof ACCOUNT_TYPE_LABELS]}</p>
              </div>
              <Amount value={account.balance} className="text-[15px] font-semibold" tone={parseDecimal(account.balance) < 0n ? "negative" : "default"} />
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {active.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No hay cuentas activas.</p>}
        </div>
      </Section>

      <Section title="Tarjetas de crédito">
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {cards.map((card) => (
            <Link key={card.id} href={`/tarjetas/${card.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50">
              <AccountIcon type="CREDIT_CARD" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">
                  {card.name}
                  {!card.isActive && <span className="ml-2 text-[12px] font-medium text-muted-foreground">Inactiva</span>}
                </p>
                <p className={`truncate text-[13px] ${card.lastStatement?.status === "overdue" ? "font-semibold text-negative" : "text-muted-foreground"}`}>
                  {cardSummary(card)}
                </p>
              </div>
              <div className="text-right">
                <Amount value={card.totalDebt} className="text-[15px] font-semibold" />
                <p className="text-[12px] text-muted-foreground">deuda</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {cards.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No tenés tarjetas cargadas.</p>}
        </div>
      </Section>

      {inactive.length > 0 && (
        <Section title="Inactivas">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card opacity-75">
            {inactive.map((account) => (
              <Link key={account.id} href={`/cuentas/${account.id}`} className="flex items-center gap-3 px-4 py-3">
                <AccountIcon type={account.type} />
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{account.name}</p>
                <Amount value={account.balance} tone="muted" className="text-[15px]" />
              </Link>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
