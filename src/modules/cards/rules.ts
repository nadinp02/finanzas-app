/**
 * Motor de tarjetas de crédito (docs/BUSINESS_RULES.md §6). Funciones puras: el servicio reúne los
 * datos de la base y este módulo calcula resúmenes, saldo a pagar, cuotas y deuda.
 */
import {
  addMonths,
  dateInMonth,
  monthOf,
  type LocalDate,
  type YearMonth,
} from "@/lib/dates";
import { maxCents, splitInstallments, sumCents, type Cents } from "@/lib/money";

export interface CycleOverride {
  closingDate: LocalDate;
  dueDate: LocalDate;
}

export interface CardCycleConfig {
  closingDay: number;
  dueDay: number;
  /** Fechas reales de resúmenes puntuales, por período 'YYYY-MM'. */
  overrides?: ReadonlyMap<YearMonth, CycleOverride>;
}

export function closingDate(config: CardCycleConfig, period: YearMonth): LocalDate {
  return config.overrides?.get(period)?.closingDate ?? dateInMonth(period, config.closingDay);
}

/** Vence en el mismo mes si el día de vencimiento es posterior al de cierre; si no, en el siguiente. */
export function dueDate(config: CardCycleConfig, period: YearMonth): LocalDate {
  const override = config.overrides?.get(period);
  if (override) return override.dueDate;
  const dueMonth = config.dueDay > config.closingDay ? period : addMonths(period, 1);
  return dateInMonth(dueMonth, config.dueDay);
}

/** Resumen en el que se factura algo ocurrido en `date`: las compras del día del cierre entran. */
export function periodOf(config: CardCycleConfig, date: LocalDate): YearMonth {
  const month = monthOf(date);
  return date <= closingDate(config, month) ? month : addMonths(month, 1);
}

export interface ScheduledInstallment {
  number: number;
  amount: Cents;
  period: YearMonth;
}

/** Cuotas de una compra: la k-ésima se factura k−1 resúmenes después del de la compra. */
export function buildInstallmentSchedule(total: Cents, count: number, firstPeriod: YearMonth): ScheduledInstallment[] {
  return splitInstallments(total, count).map((amount, index) => ({
    number: index + 1,
    amount,
    period: addMonths(firstPeriod, index),
  }));
}

export interface CardLedgerInput {
  config: CardCycleConfig;
  /** Inicio del registro para esta tarjeta. */
  openingDate: LocalDate;
  openingStatementBalance: Cents;
  openingUnbilledBalance: Cents;
  /** Compras en un pago (positivas). */
  charges: { date: LocalDate; amount: Cents }[];
  /** Todas las cuotas: de compras registradas y previas al inicio. */
  installments: { period: YearMonth; amount: Cents }[];
  /** Pagos de tarjeta (positivos, bajan la deuda). */
  payments: { date: LocalDate; amount: Cents }[];
  /** Ajustes con signo sobre el saldo: positivo baja la deuda. */
  adjustments: { date: LocalDate; amount: Cents }[];
  creditLimit?: Cents | null;
}

export type StatementStatus = "paid" | "partial" | "unpaid" | "overdue" | "no-balance";

export interface StatementSummary {
  period: YearMonth;
  closingDate: LocalDate;
  dueDate: LocalDate;
  /** Cargos facturados en este resumen (consumos, cuotas, ajustes). */
  charges: Cents;
  /** Saldo del resumen: acumulado de cargos menos pagos hasta el cierre. */
  balance: Cents;
  /** Pagos hechos después del cierre (hasta el cierre siguiente o hoy). */
  paid: Cents;
  status: StatementStatus;
}

export interface CardStatus {
  totalDebt: Cents;
  availableLimit: Cents | null;
  /** Último resumen cerrado, o null si todavía no cerró ninguno desde el inicio. */
  lastStatement: (StatementSummary & { remaining: Cents; creditBalance: Cents }) | null;
  /** Resumen en curso: compras pendientes de cierre más las cuotas que caen en él. */
  currentPeriod: { period: YearMonth; closingDate: LocalDate; dueDate: LocalDate; charges: Cents };
  /** Cuotas que se facturarán después del resumen en curso. */
  futureInstallments: Cents;
  futureInstallmentsByPeriod: { period: YearMonth; amount: Cents }[];
  /** Historial de resúmenes cerrados, del más reciente al más antiguo. */
  statements: StatementSummary[];
}

function add(map: Map<YearMonth, Cents>, period: YearMonth, amount: Cents) {
  map.set(period, (map.get(period) ?? 0n) + amount);
}

export function computeCardStatus(input: CardLedgerInput, today: LocalDate): CardStatus {
  const { config } = input;
  const firstOpen = periodOf(config, input.openingDate);
  const firstPeriod = addMonths(firstOpen, -1);
  const openPeriod = periodOf(config, today);
  const lastClosedPeriod = addMonths(openPeriod, -1);

  const charges = new Map<YearMonth, Cents>();
  const credits = new Map<YearMonth, Cents>();
  add(charges, firstPeriod, input.openingStatementBalance);
  add(charges, firstOpen, input.openingUnbilledBalance);
  for (const { date, amount } of input.charges) add(charges, periodOf(config, date), amount);
  for (const { period, amount } of input.installments) add(charges, period, amount);
  // Un ajuste positivo sube el saldo de la tarjeta, es decir, baja la deuda.
  for (const { date, amount } of input.adjustments) add(charges, periodOf(config, date), -amount);
  for (const { date, amount } of input.payments) add(credits, periodOf(config, date), amount);

  const totalDebt = sumCents(charges.values()) - sumCents(credits.values());

  // Saldo acumulado al cierre de cada resumen, desde el anterior al inicio hasta el último cerrado.
  const statements: StatementSummary[] = [];
  let running = 0n;
  for (let period = firstPeriod; period <= lastClosedPeriod; period = addMonths(period, 1)) {
    const periodCharges = charges.get(period) ?? 0n;
    running += periodCharges - (credits.get(period) ?? 0n);
    const paid = credits.get(addMonths(period, 1)) ?? 0n;
    const due = dueDate(config, period);
    let status: StatementStatus;
    if (running <= 0n) status = "no-balance";
    else if (paid >= running) status = "paid";
    else if (today > due) status = "overdue";
    else status = paid > 0n ? "partial" : "unpaid";
    statements.push({ period, closingDate: closingDate(config, period), dueDate: due, charges: periodCharges, balance: running, paid, status });
  }

  const latest = statements.at(-1);
  const lastStatement = latest
    ? {
        ...latest,
        remaining: maxCents(0n, latest.balance - latest.paid),
        creditBalance: maxCents(0n, latest.paid - latest.balance),
      }
    : null;

  const futureInstallmentsByPeriod = [...charges.entries()]
    .filter(([period]) => period > openPeriod)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, amount]) => ({ period, amount }));

  return {
    totalDebt,
    availableLimit: input.creditLimit != null ? input.creditLimit - totalDebt : null,
    lastStatement,
    currentPeriod: {
      period: openPeriod,
      closingDate: closingDate(config, openPeriod),
      dueDate: dueDate(config, openPeriod),
      charges: charges.get(openPeriod) ?? 0n,
    },
    futureInstallments: sumCents(futureInstallmentsByPeriod.map(({ amount }) => amount)),
    futureInstallmentsByPeriod,
    statements: statements.reverse(),
  };
}

/** Deuda inicial total: saldo impago + consumos sin facturar + cuotas previas pendientes. */
export function openingDebt(statement: Cents, unbilled: Cents, preexistingInstallments: Cents[]): Cents {
  return statement + unbilled + sumCents(preexistingInstallments);
}
