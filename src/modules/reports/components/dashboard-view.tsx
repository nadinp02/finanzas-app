import { cn } from "cn";
import { AlertCircle, CalendarClock, ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { Card, Section } from "@/components/page-header";
import { addMonths, capitalize, formatLongDate, formatMonth, formatShortDate, monthOf, yearOf } from "@/lib/dates";
import { parseDecimal, progressRatio } from "@/lib/money";
import { CategoryChip } from "@/modules/categories/components/category-chip";
import { categoryColor } from "@/modules/categories/palette";
import { TransactionFeed } from "@/modules/transactions/components/transaction-feed";
import type { ChangeDTO, DashboardDTO } from "../schema";
import { ExpenseChart } from "./expense-chart";

const monthHref = (month: string, current: string) => (month === current ? "/" : `/?mes=${month}`);

export function MonthSwitcher({ data }: { data: DashboardDTO }) {
  const current = monthOf(data.today);
  const label = capitalize(formatMonth(data.month, yearOf(data.today)));
  const arrow = "inline-flex size-10 items-center justify-center rounded-full border bg-card text-foreground hover:bg-accent";
  return (
    <nav aria-label="Mes" className="flex items-center gap-2">
      {data.navigation.previous ? (
        <Link href={monthHref(data.navigation.previous, current)} className={arrow} aria-label="Mes anterior">
          <ChevronLeft className="size-5" />
        </Link>
      ) : (
        <span className={cn(arrow, "opacity-40")} aria-hidden="true">
          <ChevronLeft className="size-5" />
        </span>
      )}
      <h2 className="min-w-28 text-center text-[17px] font-bold" aria-live="polite">
        {label}
      </h2>
      {data.navigation.next ? (
        <Link href={monthHref(data.navigation.next, current)} className={arrow} aria-label="Mes siguiente">
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className={cn(arrow, "opacity-40")} aria-hidden="true">
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}

function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** "+49,1 %" / "−26,5 %", con el mismo signo menos tipográfico que los importes. */
function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${String(Math.abs(Math.round(value * 10) / 10)).replace(".", ",")} %`;
}

/** "+$ 5.000 (+50 %)" con la lectura correcta: más gasto es malo, más ingreso o ahorro es bueno. */
function ChangeText({ change, higherIsBetter }: { change: ChangeDTO; higherIsBetter: boolean }) {
  const diff = parseDecimal(change.diff);
  if (diff === 0n) return <span className="text-muted-foreground">igual</span>;
  const good = diff > 0n === higherIsBetter;
  const percent = change.percent === null ? "" : ` (${formatPercent(change.percent)})`;
  return (
    <span className={good ? "text-positive" : "text-negative"}>
      <Amount value={change.diff} sign="always" tone={good ? "positive" : "negative"} />
      {percent}
    </span>
  );
}

function MonthSummary({ data }: { data: DashboardDTO }) {
  const { totals, comparison } = data;
  const expense = parseDecimal(totals.expense);
  const fixedShare = progressRatio(parseDecimal(totals.fixed), expense);
  const compareLabel = comparison
    ? data.isCurrentMonth
      ? `${formatShortDate(comparison.range.from)} al ${formatShortDate(comparison.range.to)}`
      : formatMonth(monthOf(comparison.range.from), yearOf(data.today))
    : null;

  return (
    <Card className="p-5">
      <Stat label={data.isCurrentMonth ? "Gastos del mes hasta hoy" : "Gastos del mes"}>
        <Amount value={totals.expense} className="mt-1 block text-[36px] leading-tight font-bold" />
      </Stat>
      {expense > 0n && (
        <div className="mt-3">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            <div className="rounded-full bg-chart-1" style={{ width: `${fixedShare * 100}%` }} />
            <div className="flex-1 rounded-full bg-chart-3" />
          </div>
          <div className="mt-1.5 flex justify-between text-[13px]">
            <span>
              <span className="text-muted-foreground">Fijos </span>
              <Amount value={totals.fixed} className="font-semibold" />
            </span>
            <span>
              <span className="text-muted-foreground">Variables </span>
              <Amount value={totals.variable} className="font-semibold" />
            </span>
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
        <Stat label="Ingresos">
          <Amount value={totals.income} className="mt-0.5 block text-[20px] font-bold" />
        </Stat>
        <Stat label="Ahorro del mes">
          <Amount value={totals.savings} tone={parseDecimal(totals.savings) < 0n ? "negative" : "default"} className="mt-0.5 block text-[20px] font-bold" />
        </Stat>
      </div>
      {comparison && (
        <dl className="mt-4 grid gap-1 border-t pt-4 text-[13px]">
          <p className="mb-1 font-semibold text-muted-foreground">Contra {compareLabel}</p>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Gastos</dt>
            <dd className="font-semibold">
              <ChangeText change={comparison.change.expense} higherIsBetter={false} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Ingresos</dt>
            <dd className="font-semibold">
              <ChangeText change={comparison.change.income} higherIsBetter />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Ahorro</dt>
            <dd className="font-semibold">
              <ChangeText change={comparison.change.savings} higherIsBetter />
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function ProjectionCard({ projection }: { projection: NonNullable<DashboardDTO["projection"]> }) {
  const expected = parseDecimal(projection.expectedExpense) + parseDecimal(projection.expectedIncome);
  return (
    <Card className="p-5">
      <p className="text-[13px] font-semibold text-muted-foreground">Si seguís a este ritmo, al cierre del mes</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Stat label="Gastos">
          <Amount value={projection.expense} className="mt-0.5 block text-[20px] font-bold" />
        </Stat>
        <Stat label="Ahorro">
          <Amount value={projection.savings} tone={parseDecimal(projection.savings) < 0n ? "negative" : "default"} className="mt-0.5 block text-[20px] font-bold" />
        </Stat>
      </div>
      {expected > 0n && <p className="mt-2 text-[12px] text-muted-foreground">Incluye movimientos pendientes de confirmar de este mes.</p>}
    </Card>
  );
}

function CategoryBreakdown({ data }: { data: DashboardDTO }) {
  const top = data.categories.slice(0, 8);
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {top.map((category) => (
        <li key={category.id}>
          <Link
            href={category.id === "none" ? `/movimientos?mes=${data.month}` : `/movimientos?mes=${data.month}&categoryId=${category.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50"
          >
            <CategoryChip icon={category.icon} color={category.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-semibold">{category.name}</span>
                <Amount value={category.amount} className="text-[15px] font-semibold" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(category.share * 100, 2)}%`, backgroundColor: categoryColor(category.color) }} />
                </div>
                <span className="w-9 text-right text-[12px] text-muted-foreground tabular-nums">{Math.round(category.share * 100)} %</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Alerts({ data }: { data: DashboardDTO }) {
  if (data.upcoming.length === 0 && data.pending.count === 0) return null;
  return (
    <div className="grid gap-2">
      {data.pending.count > 0 && (
        <Link href="/movimientos?status=PENDING" className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-card px-4 py-3 hover:bg-accent/50">
          <AlertCircle className="size-5 shrink-0 text-warning" />
          <span className="flex-1 text-[15px] font-semibold">
            {data.pending.count === 1 ? "1 movimiento pendiente de confirmar" : `${data.pending.count} movimientos pendientes de confirmar`}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}
      {data.upcoming.map((item) => (
        <Link key={item.cardId} href={`/tarjetas/${item.cardId}`} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 hover:bg-accent/50">
          {item.status === "overdue" ? <CalendarClock className="size-5 shrink-0 text-negative" /> : <CreditCard className="size-5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{item.name}</span>
            <span className={cn("block text-[13px]", item.status === "overdue" ? "font-semibold text-negative" : "text-muted-foreground")}>
              {item.status === "overdue" ? "Vencido" : "Vence"} el {formatShortDate(item.dueDate)}
            </span>
          </span>
          <Amount value={item.amount} className="text-[15px] font-semibold" />
        </Link>
      ))}
    </div>
  );
}

function NetWorthCard({ data }: { data: DashboardDTO }) {
  const { balances } = data;
  return (
    <Card className="p-0">
      <div className="grid grid-cols-3 divide-x">
        {[
          { label: "Disponible", value: balances.available },
          { label: "Deuda tarjetas", value: balances.cardDebt },
          { label: "Patrimonio", value: balances.netWorth },
        ].map((item) => (
          <div key={item.label} className="px-2 py-4 text-center">
            <p className="text-[12px] font-semibold text-muted-foreground">{item.label}</p>
            <Amount value={item.value} decimals="never" className="mt-1 block text-[16px] font-bold" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[13px]">
        <span className="text-muted-foreground">Ahorro acumulado desde el {formatShortDate(data.trackingStartDate, data.today)}</span>
        <Amount value={balances.accumulatedSavings} className="font-semibold" />
      </div>
    </Card>
  );
}

export function DashboardView({ data }: { data: DashboardDTO }) {
  if (data.beforeTracking) {
    return (
      <Card className="px-5 py-10 text-center">
        <p className="text-[15px] font-semibold">Este mes es anterior al inicio del registro</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Empezaste a registrar el {formatLongDate(data.trackingStartDate)}.</p>
        <Link href={monthHref(monthOf(data.trackingStartDate), monthOf(data.today))} className="mt-4 inline-block text-sm font-semibold underline">
          Ir a {formatMonth(monthOf(data.trackingStartDate), yearOf(data.today))}
        </Link>
      </Card>
    );
  }

  const previousMonth = addMonths(data.month, -1);
  const hasExpenses = parseDecimal(data.totals.expense) > 0n;

  return (
    <div className="grid gap-4">
      <Alerts data={data} />
      <MonthSummary data={data} />
      {data.projection && hasExpenses && <ProjectionCard projection={data.projection} />}

      {hasExpenses && (
        <Section title="Gasto acumulado">
          <Card className="p-4">
            <ExpenseChart
              data={data.dailyExpense}
              currentLabel={capitalize(formatMonth(data.month, yearOf(data.today)))}
              previousLabel={capitalize(formatMonth(previousMonth, yearOf(data.today)))}
            />
          </Card>
        </Section>
      )}

      {data.categories.length > 0 && (
        <Section title="Por categoría">
          <CategoryBreakdown data={data} />
        </Section>
      )}

      <Section title="Patrimonio" action={<Link href="/cuentas" className="text-sm font-semibold text-muted-foreground">Cuentas</Link>}>
        <NetWorthCard data={data} />
        {!data.isCurrentMonth && <p className="mt-2 text-[12px] text-muted-foreground">Saldos al {formatLongDate(data.balances.asOf)}.</p>}
      </Section>

      <Section
        title={data.isCurrentMonth ? "Últimos movimientos" : "Movimientos del mes"}
        action={
          <Link href={`/movimientos?mes=${data.month}`} className="text-sm font-semibold text-muted-foreground">
            Ver todos
          </Link>
        }
      >
        <TransactionFeed initialItems={data.recent} initialCursor={null} query="" today={data.today} emptyText="Todavía no hay movimientos este mes." />
      </Section>
    </div>
  );
}
