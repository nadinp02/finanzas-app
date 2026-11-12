import "server-only";
import {
  addMonths,
  firstDayOfMonth,
  fromDbDate,
  lastDayOfMonth,
  maxDate,
  monthOf,
  todayIn,
  toDbDate,
  type LocalDate,
  type YearMonth,
} from "@/lib/dates";
import { errors } from "@/lib/errors";
import { centsOf, parseDecimal, toDecimal, type Cents } from "@/lib/money";
import { prisma } from "@/server/db";
import { getBalances, netWorthOf, preexistingInstallmentTotals, type AccountBalance } from "@/modules/accounts/service";
import { listCardStatuses } from "@/modules/cards/service";
import { openingDebt } from "@/modules/cards/rules";
import { listCategories } from "@/modules/categories/service";
import { listTransactions } from "@/modules/transactions/service";
import { listPendingVoiceEntries } from "@/modules/voice/service";
import {
  changeBetween,
  comparisonRange,
  cumulativeByDay,
  expensesByRootCategory,
  projectMonth,
  reportRange,
  totalsFromRows,
  trackedDaysInMonth,
  type Change,
  type DateRange,
  type HistoryMonth,
  type PeriodTotals,
} from "./rules";
import type { ChangeDTO, DashboardDTO, TotalsDTO } from "./schema";

/** Meses hacia atrás en los que se buscan hasta 3 meses con datos para el ritmo histórico. */
const HISTORY_LOOKBACK_MONTHS = 12;
const HISTORY_MONTHS = 3;

function dateFilter(range: DateRange) {
  return { gte: toDbDate(range.from), lte: toDbDate(range.to) };
}

/** Totales de movimientos confirmados en un rango (transferencias y pagos no cuentan). */
export async function totalsBetween(userId: string, range: DateRange): Promise<PeriodTotals> {
  const rows = await prisma.transaction.groupBy({
    by: ["type", "isFixed"],
    where: { userId, status: "CONFIRMED", date: dateFilter(range) },
    _sum: { amount: true },
  });
  return totalsFromRows(rows.map((row) => ({ type: row.type, isFixed: row.isFixed, total: row._sum.amount ? centsOf(row._sum.amount) : 0n })));
}

async function dailyExpenses(userId: string, range: DateRange): Promise<Map<LocalDate, Cents>> {
  const rows = await prisma.transaction.groupBy({
    by: ["date"],
    where: { userId, status: "CONFIRMED", type: "EXPENSE", date: dateFilter(range) },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [fromDbDate(row.date), row._sum.amount ? centsOf(row._sum.amount) : 0n]));
}

/** Hasta 3 meses anteriores con movimientos confirmados, el más reciente primero (§8.2). */
async function variableHistory(userId: string, month: YearMonth, trackingStart: LocalDate): Promise<HistoryMonth[]> {
  const from = maxDate(firstDayOfMonth(addMonths(month, -HISTORY_LOOKBACK_MONTHS)), trackingStart);
  const before = firstDayOfMonth(month);
  if (from >= before) return [];
  const rows = await prisma.$queryRaw<{ month: string; variable: string }[]>`
    SELECT to_char(date, 'YYYY-MM') AS month,
           COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE' AND NOT is_fixed), 0)::text AS variable
      FROM transactions
     WHERE user_id = ${userId}::uuid AND status = 'CONFIRMED'
       AND date >= ${toDbDate(from)}::date AND date < ${toDbDate(before)}::date
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT ${HISTORY_MONTHS}`;
  return rows.map((row) => ({ variable: centsOf(row.variable), days: trackedDaysInMonth(row.month, trackingStart) }));
}

/** Pendientes del mes: se esperan, pero todavía no afectan totales ni saldos. */
async function pendingFlowsOfMonth(userId: string, month: YearMonth): Promise<{ expense: Cents; income: Cents }> {
  const rows = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      status: "PENDING",
      type: { in: ["EXPENSE", "INCOME"] },
      date: { gte: toDbDate(firstDayOfMonth(month)), lte: toDbDate(lastDayOfMonth(month)) },
    },
    _sum: { amount: true },
  });
  const total = (type: string) => {
    const amount = rows.find((row) => row.type === type)?._sum.amount;
    return amount ? centsOf(amount) : 0n;
  };
  return { expense: total("EXPENSE"), income: total("INCOME") };
}

export interface NetWorthBreakdown {
  asOf: LocalDate;
  /** Σ saldos iniciales de activos − Σ deudas iniciales de tarjetas (cuentas abiertas hasta `asOf`). */
  initial: Cents;
  accumulatedSavings: Cents;
  adjustments: Cents;
  available: Cents;
  cardDebt: Cents;
  netWorth: Cents;
  balances: AccountBalance[];
}

/**
 * Patrimonio y sus componentes a una fecha. Cumple la identidad de control (BUSINESS_RULES §8):
 * patrimonio = inicial + ahorro acumulado + Σ ajustes.
 */
export async function getNetWorthBreakdown(userId: string, asOf: LocalDate, trackingStart: LocalDate): Promise<NetWorthBreakdown> {
  const [balances, accounts, preexisting, totals] = await Promise.all([
    getBalances(userId, asOf),
    prisma.account.findMany({
      where: { userId, openingDate: { lte: toDbDate(asOf) } },
      select: { id: true, openingBalance: true, card: { select: { openingStatementBalance: true, openingUnbilledBalance: true } } },
    }),
    preexistingInstallmentTotals(prisma, userId),
    asOf < trackingStart ? null : totalsBetween(userId, { from: trackingStart, to: asOf }),
  ]);
  let initial = 0n;
  for (const account of accounts) {
    initial += account.card
      ? -openingDebt(centsOf(account.card.openingStatementBalance), centsOf(account.card.openingUnbilledBalance), [preexisting.get(account.id) ?? 0n])
      : centsOf(account.openingBalance);
  }
  const { available, cardDebt, netWorth } = netWorthOf(balances);
  return {
    asOf,
    initial,
    accumulatedSavings: totals?.savings ?? 0n,
    adjustments: totals?.adjustments ?? 0n,
    available,
    cardDebt,
    netWorth,
    balances,
  };
}

function totalsDTO(totals: PeriodTotals): TotalsDTO {
  return {
    income: toDecimal(totals.income),
    expense: toDecimal(totals.expense),
    fixed: toDecimal(totals.fixed),
    variable: toDecimal(totals.variable),
    savings: toDecimal(totals.savings),
    adjustments: toDecimal(totals.adjustments),
  };
}

function changeDTO(change: Change): ChangeDTO {
  return { diff: toDecimal(change.diff), percent: change.percent === null ? null : Math.round(change.percent * 10) / 10 };
}

interface DashboardUser {
  id: string;
  trackingStartDate: LocalDate | null;
}

/** Métricas del inicio para un mes (por defecto, el actual). */
export async function getDashboard(user: DashboardUser, requestedMonth?: YearMonth, today: LocalDate = todayIn()): Promise<DashboardDTO> {
  if (!user.trackingStartDate) throw errors.conflict("NOT_ONBOARDED", "Primero completá la configuración inicial.");
  const trackingStart = user.trackingStartDate;
  const userId = user.id;
  const month = requestedMonth ?? monthOf(today);
  if (month > monthOf(today)) throw errors.validation({ month: "Ese mes todavía no empezó." });

  const range = reportRange(month, today, trackingStart);
  const navigation = {
    previous: month > monthOf(trackingStart) ? addMonths(month, -1) : null,
    next: month < monthOf(today) ? addMonths(month, 1) : null,
  };
  const compareRange = range.beforeTracking ? null : comparisonRange(range, trackingStart);
  const previousMonth = addMonths(month, -1);
  const previousSeriesRange = { from: maxDate(firstDayOfMonth(previousMonth), trackingStart), to: lastDayOfMonth(previousMonth) };

  const [totals, previousTotals, daily, previousDaily, categoryRows, categories, history, pendingFlows, breakdown, pendingCount, pendingItems, recent, cards, pendingVoice] =
    await Promise.all([
      range.beforeTracking ? null : totalsBetween(userId, range),
      compareRange ? totalsBetween(userId, compareRange) : null,
      range.beforeTracking ? new Map<LocalDate, Cents>() : dailyExpenses(userId, range),
      previousSeriesRange.to < trackingStart ? new Map<LocalDate, Cents>() : dailyExpenses(userId, previousSeriesRange),
      range.beforeTracking
        ? []
        : prisma.transaction.groupBy({
            by: ["categoryId"],
            where: { userId, status: "CONFIRMED", type: "EXPENSE", date: dateFilter(range) },
            _sum: { amount: true },
          }),
      listCategories(userId),
      range.isCurrent ? variableHistory(userId, month, trackingStart) : [],
      range.isCurrent ? pendingFlowsOfMonth(userId, month) : null,
      getNetWorthBreakdown(userId, range.to, trackingStart),
      prisma.transaction.count({ where: { userId, status: "PENDING" } }),
      listTransactions(userId, { status: "PENDING", limit: 5 }),
      range.beforeTracking ? null : listTransactions(userId, { from: range.from, to: range.to, limit: 5 }),
      range.isCurrent ? listCardStatuses(userId, today) : [],
      listPendingVoiceEntries(userId),
    ]);

  const periodTotals = totals ?? totalsFromRows([]);
  const projection = pendingFlows
    ? projectMonth({ range, totals: periodTotals, history, expectedExpense: pendingFlows.expense, expectedIncome: pendingFlows.income })
    : null;

  const currentSeries = cumulativeByDay(month, daily, range.from, range.to);
  const previousSeries = cumulativeByDay(previousMonth, previousDaily, previousSeriesRange.from, previousSeriesRange.to);
  return {
    month,
    today,
    trackingStartDate: trackingStart,
    isCurrentMonth: range.isCurrent,
    beforeTracking: range.beforeTracking,
    range: { from: range.from, to: range.to },
    navigation,
    totals: totalsDTO(periodTotals),
    comparison:
      compareRange && previousTotals
        ? {
            range: compareRange,
            totals: totalsDTO(previousTotals),
            change: {
              income: changeDTO(changeBetween(periodTotals.income, previousTotals.income)),
              expense: changeDTO(changeBetween(periodTotals.expense, previousTotals.expense)),
              savings: changeDTO(changeBetween(periodTotals.savings, previousTotals.savings)),
            },
          }
        : null,
    projection:
      projection && pendingFlows
        ? {
            expense: toDecimal(projection.expense),
            income: toDecimal(projection.income),
            savings: toDecimal(projection.savings),
            expectedExpense: toDecimal(pendingFlows.expense),
            expectedIncome: toDecimal(pendingFlows.income),
          }
        : null,
    categories: expensesByRootCategory(
      categoryRows.map((row) => ({ categoryId: row.categoryId, total: row._sum.amount ? centsOf(row._sum.amount) : 0n })),
      categories,
    ).map((category) => ({ ...category, amount: toDecimal(category.amount) })),
    dailyExpense: currentSeries.map((value, index) => ({
      day: index + 1,
      current: value === null ? null : toDecimal(value),
      previous: previousSeries[index] == null ? null : toDecimal(previousSeries[index]!),
    })),
    balances: {
      asOf: range.to,
      available: toDecimal(breakdown.available),
      cardDebt: toDecimal(breakdown.cardDebt),
      netWorth: toDecimal(breakdown.netWorth),
      accumulatedSavings: toDecimal(breakdown.accumulatedSavings),
      accounts: breakdown.balances.filter((account) => account.isActive || account.balance !== 0n).map(({ id, name, type, balance }) => ({ id, name, type, balance: toDecimal(balance) })),
    },
    pending: { count: pendingCount, items: pendingItems.items },
    pendingVoice,
    upcoming: cards
      .filter((card) => card.isActive && card.lastStatement && parseDecimal(card.lastStatement.remaining) > 0n)
      .map((card) => ({
        cardId: card.id,
        name: card.name,
        period: card.lastStatement!.period,
        dueDate: card.lastStatement!.dueDate,
        amount: card.lastStatement!.remaining,
        status: card.lastStatement!.status,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    recent: recent?.items ?? [],
  };
}
