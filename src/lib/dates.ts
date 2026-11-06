/**
 * Fechas contables como strings ISO ('YYYY-MM-DD') y meses como 'YYYY-MM'. Un gasto ocurre en un
 * día, no en un instante: operar con strings evita corrimientos por zona horaria. La aritmética usa
 * Date en UTC, donde no hay horario de verano.
 */

export type LocalDate = string;
export type YearMonth = string;

export const APP_TIMEZONE = "America/Argentina/Cordoba";

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toISOString().slice(0, 10) === value;
}

export function isYearMonth(value: string): boolean {
  return YEAR_MONTH_PATTERN.test(value);
}

/** Fecha de hoy en la zona horaria indicada. */
export function todayIn(timeZone: string = APP_TIMEZONE, now: Date = new Date()): LocalDate {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtc(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function fromUtc(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

/** Prisma representa DATE como Date a medianoche UTC. */
export function toDbDate(date: LocalDate): Date {
  return toUtc(date);
}

export function fromDbDate(date: Date): LocalDate {
  return fromUtc(date);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtc(value);
}

export function diffDays(later: LocalDate, earlier: LocalDate): number {
  return Math.round((toUtc(later).getTime() - toUtc(earlier).getTime()) / 86_400_000);
}

export function monthOf(date: LocalDate): YearMonth {
  return date.slice(0, 7);
}

export function yearOf(date: LocalDate | YearMonth): number {
  return Number(date.slice(0, 4));
}

export function addMonths(month: YearMonth, months: number): YearMonth {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`;
}

export function diffMonths(later: YearMonth, earlier: YearMonth): number {
  const [ly, lm] = later.split("-").map(Number) as [number, number];
  const [ey, em] = earlier.split("-").map(Number) as [number, number];
  return (ly - ey) * 12 + (lm - em);
}

export function daysInMonth(month: YearMonth): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Día `day` del mes; si el mes es más corto, su último día (31 de febrero → 28/29). */
export function dateInMonth(month: YearMonth, day: number): LocalDate {
  const clamped = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${String(clamped).padStart(2, "0")}`;
}

export function dayOfMonth(date: LocalDate): number {
  return Number(date.slice(8, 10));
}

export function firstDayOfMonth(month: YearMonth): LocalDate {
  return `${month}-01`;
}

export function lastDayOfMonth(month: YearMonth): LocalDate {
  return dateInMonth(month, 31);
}

/** 0 = domingo … 6 = sábado. */
export function dayOfWeek(date: LocalDate): number {
  return toUtc(date).getUTCDay();
}

/** Semana ISO 8601 ('2026-W45'): las semanas empiezan el lunes y la semana 1 contiene el primer jueves. */
export function isoWeekKey(date: LocalDate): string {
  const value = toUtc(date);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const year = value.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((value.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a < b ? a : b;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}

// Nombres fijos en lugar de Intl: el ICU de Node y el de Safari difieren ("3 de nov de 2025" vs
// "3 nov 2025") y eso rompe la hidratación entre servidor y cliente.
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

function monthIndex(date: LocalDate | YearMonth): number {
  return Number(date.slice(5, 7)) - 1;
}

export function monthName(month: YearMonth): string {
  return MONTHS[monthIndex(month)]!;
}

export function weekdayName(date: LocalDate): string {
  return WEEKDAYS[dayOfWeek(date)]!;
}

/** "Hoy", "Ayer", "lunes 2 de noviembre" (con año si no es el de `today`). */
export function formatDayHeading(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Hoy";
  if (date === addDays(today, -1)) return "Ayer";
  const text = `${weekdayName(date)} ${dayOfMonth(date)} de ${MONTHS[monthIndex(date)]}`;
  return yearOf(date) === yearOf(today) ? text : `${text} de ${yearOf(date)}`;
}

/** "3 nov" o "3 nov 2025" si no es el año de `today`. */
export function formatShortDate(date: LocalDate, today?: LocalDate): string {
  const text = `${dayOfMonth(date)} ${MONTHS[monthIndex(date)]!.slice(0, 3)}`;
  return today && yearOf(date) !== yearOf(today) ? `${text} ${yearOf(date)}` : text;
}

/** "3 de noviembre de 2026". */
export function formatLongDate(date: LocalDate): string {
  return `${dayOfMonth(date)} de ${MONTHS[monthIndex(date)]} de ${yearOf(date)}`;
}

/** "noviembre 2026", o solo "noviembre" si es el año de referencia. */
export function formatMonth(month: YearMonth, referenceYear?: number): string {
  const name = monthName(month);
  return referenceYear === yearOf(month) ? name : `${name} ${yearOf(month)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
