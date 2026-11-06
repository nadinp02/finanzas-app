/**
 * Reglas puras de los informes (BUSINESS_RULES §8): rangos, comparación a la misma altura del mes,
 * proyección al cierre y agrupación del gasto por categoría. Todo en centavos (bigint).
 */
import {
  addMonths,
  dateInMonth,
  dayOfMonth,
  daysInMonth,
  diffDays,
  firstDayOfMonth,
  lastDayOfMonth,
  maxDate,
  monthOf,
  type LocalDate,
  type YearMonth,
} from "@/lib/dates";
import { mulDiv, percentChange, progressRatio, sumCents, type Cents } from "@/lib/money";

export interface PeriodTotals {
  income: Cents;
  expense: Cents;
  fixed: Cents;
  variable: Cents;
  /** Ingresos − gastos. */
  savings: Cents;
  /** Informativo: los ajustes de saldo no son ingreso ni gasto. */
  adjustments: Cents;
}

export const EMPTY_TOTALS: PeriodTotals = { income: 0n, expense: 0n, fixed: 0n, variable: 0n, savings: 0n, adjustments: 0n };

/** Fila agregada de movimientos confirmados (tipo + fijo). */
export interface TotalsRow {
  type: "INCOME" | "EXPENSE" | "ADJUSTMENT" | "TRANSFER" | "CARD_PAYMENT";
  isFixed: boolean;
  total: Cents;
}

/** Transferencias y pagos de tarjeta no son ingreso ni gasto: se ignoran. */
export function totalsFromRows(rows: TotalsRow[]): PeriodTotals {
  let income = 0n;
  let fixed = 0n;
  let variable = 0n;
  let adjustments = 0n;
  for (const row of rows) {
    if (row.type === "INCOME") income += row.total;
    else if (row.type === "EXPENSE") {
      if (row.isFixed) fixed += row.total;
      else variable += row.total;
    } else if (row.type === "ADJUSTMENT") adjustments += row.total;
  }
  const expense = fixed + variable;
  return { income, expense, fixed, variable, savings: income - expense, adjustments };
}

export interface DateRange {
  from: LocalDate;
  to: LocalDate;
}

export interface ReportRange extends DateRange {
  month: YearMonth;
  /** El mes seleccionado es el actual: el rango termina hoy. */
  isCurrent: boolean;
  /** El mes es completamente anterior al inicio del registro: no hay datos que mostrar. */
  beforeTracking: boolean;
}

/**
 * Rango de un informe mensual: desde el día 1 (o la fecha de inicio del registro, si es posterior)
 * hasta el último día del mes, o hasta hoy en el mes en curso. Los meses futuros no se informan.
 */
export function reportRange(month: YearMonth, today: LocalDate, trackingStart: LocalDate): ReportRange {
  const current = monthOf(today);
  if (month > current) throw new RangeError("El mes todavía no empezó.");
  const isCurrent = month === current;
  const to = isCurrent ? today : lastDayOfMonth(month);
  const from = maxDate(firstDayOfMonth(month), trackingStart);
  return { month, from, to, isCurrent, beforeTracking: to < trackingStart };
}

/**
 * Período de comparación (§8.1): el mes anterior completo, o en el mes en curso el mes anterior hasta
 * el mismo día (o su último día si es más corto). Null si cae entero antes del inicio del registro.
 */
export function comparisonRange(range: ReportRange, trackingStart: LocalDate): DateRange | null {
  const previous = addMonths(range.month, -1);
  const to = range.isCurrent ? dateInMonth(previous, dayOfMonth(range.to)) : lastDayOfMonth(previous);
  if (to < trackingStart) return null;
  return { from: maxDate(firstDayOfMonth(previous), trackingStart), to };
}

export interface Change {
  diff: Cents;
  /** Variación porcentual; null sin base de comparación (anterior en cero). */
  percent: number | null;
}

export function changeBetween(current: Cents, previous: Cents): Change {
  return { diff: current - previous, percent: percentChange(current, previous) };
}

/** Gasto variable de un mes anterior y los días registrados en él (para el ritmo histórico). */
export interface HistoryMonth {
  variable: Cents;
  days: number;
}

export interface ProjectionInput {
  range: ReportRange;
  totals: PeriodTotals;
  /** Hasta 3 meses anteriores con datos, el más reciente primero. */
  history: HistoryMonth[];
  /** Gastos e ingresos esperados en lo que queda del mes (pendientes y, desde la fase 5, recurrentes). */
  expectedExpense: Cents;
  expectedIncome: Cents;
}

export interface Projection {
  expense: Cents;
  income: Cents;
  savings: Cents;
  /** Gasto variable estimado para los días que faltan. */
  variableRemaining: Cents;
}

/**
 * Proyección al cierre del mes en curso (§8.2). Con d días registrados y R días por delante:
 *
 *   ritmo = w · (V / d) + (1 − w) · (H / Dh),  w = d / (d + R)
 *         = (V + R · H / Dh) / (d + R)
 *
 * donde V es el gasto variable del mes y H / Dh el gasto variable diario de la historia. Sin historia
 * el ritmo es V / d. Se calcula con enteros y se redondea una sola vez, mitad hacia arriba.
 */
export function projectMonth(input: ProjectionInput): Projection | null {
  const { range, totals, history } = input;
  if (!range.isCurrent || range.beforeTracking) return null;
  const elapsed = BigInt(diffDays(range.to, range.from) + 1);
  const remaining = BigInt(daysInMonth(range.month) - dayOfMonth(range.to));
  const historyDays = BigInt(history.reduce((sum, month) => sum + month.days, 0));
  const historyVariable = sumCents(history.map((month) => month.variable));

  let variableRemaining: Cents;
  if (remaining === 0n) {
    variableRemaining = 0n;
  } else if (historyDays === 0n) {
    variableRemaining = mulDiv(totals.variable, remaining, elapsed);
  } else {
    // (V · Dh + R · H) · R / ((d + R) · Dh)
    const numerator = totals.variable * historyDays + remaining * historyVariable;
    variableRemaining = mulDiv(numerator, remaining, (elapsed + remaining) * historyDays);
  }

  const expense = totals.expense + variableRemaining + input.expectedExpense;
  const income = totals.income + input.expectedIncome;
  return { expense, income, savings: income - expense, variableRemaining };
}

/** Días de un mes que caen dentro del registro (para el ritmo histórico). */
export function trackedDaysInMonth(month: YearMonth, trackingStart: LocalDate): number {
  const from = maxDate(firstDayOfMonth(month), trackingStart);
  const to = lastDayOfMonth(month);
  return to < from ? 0 : diffDays(to, from) + 1;
}

export interface CategoryRef {
  id: string;
  name: string;
  parentId: string | null;
  icon: string;
  color: string;
}

export interface CategoryTotal {
  id: string;
  name: string;
  icon: string;
  color: string;
  amount: Cents;
  /** Proporción del gasto del período, en [0, 1]. */
  share: number;
}

/**
 * Gasto por categoría raíz (las subcategorías suman en su padre), de mayor a menor. Los gastos sin
 * categoría (no debería haber: el gasto la exige) se agrupan en "Sin categoría".
 */
export function expensesByRootCategory(rows: { categoryId: string | null; total: Cents }[], categories: CategoryRef[]): CategoryTotal[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, Cents>();
  for (const row of rows) {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined;
    const rootId = category ? (category.parentId ?? category.id) : "none";
    totals.set(rootId, (totals.get(rootId) ?? 0n) + row.total);
  }
  const grand = sumCents(totals.values());
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0n)
    .map(([id, amount]) => {
      const root = byId.get(id);
      return {
        id,
        name: root?.name ?? "Sin categoría",
        icon: root?.icon ?? "circle",
        color: root?.color ?? "stone",
        amount,
        share: progressRatio(amount, grand),
      };
    })
    .sort((a, b) => (a.amount === b.amount ? a.name.localeCompare(b.name) : a.amount > b.amount ? -1 : 1));
}

/**
 * Gasto acumulado día por día de un mes. Los días posteriores a `until` (el futuro del mes en curso) o
 * anteriores al inicio del registro quedan en null para que el gráfico no dibuje una meseta falsa.
 */
export function cumulativeByDay(month: YearMonth, daily: ReadonlyMap<LocalDate, Cents>, from: LocalDate, until: LocalDate): (Cents | null)[] {
  const series: (Cents | null)[] = [];
  let running = 0n;
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    const date = dateInMonth(month, day);
    if (date < from || date > until) {
      series.push(null);
      continue;
    }
    running += daily.get(date) ?? 0n;
    series.push(running);
  }
  return series;
}
