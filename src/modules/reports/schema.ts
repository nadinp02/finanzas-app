import { yearMonthSchema, z } from "@/lib/validation";
import type { AccountType } from "@/generated/prisma/enums";
import type { StatementStatus } from "@/modules/cards/rules";
import type { TransactionDTO } from "@/modules/transactions/schema";
import type { PendingVoiceEntry } from "@/modules/voice/schema";

export const dashboardQuerySchema = z.object({ month: yearMonthSchema.optional() });

export interface TotalsDTO {
  income: string;
  expense: string;
  fixed: string;
  variable: string;
  savings: string;
  adjustments: string;
}

export interface ChangeDTO {
  diff: string;
  percent: number | null;
}

/** Métricas del inicio para un mes (BUSINESS_RULES §8). Importes como strings decimales. */
export interface DashboardDTO {
  month: string;
  today: string;
  trackingStartDate: string;
  isCurrentMonth: boolean;
  /** El mes es anterior al inicio del registro: estado vacío explicativo. */
  beforeTracking: boolean;
  range: { from: string; to: string };
  navigation: { previous: string | null; next: string | null };
  totals: TotalsDTO;
  comparison: {
    range: { from: string; to: string };
    totals: TotalsDTO;
    change: { income: ChangeDTO; expense: ChangeDTO; savings: ChangeDTO };
  } | null;
  /** Solo en el mes en curso. */
  projection: { expense: string; income: string; savings: string; expectedExpense: string; expectedIncome: string } | null;
  categories: { id: string; name: string; icon: string; color: string; amount: string; share: number }[];
  /** Gasto acumulado por día del mes y del mes anterior (null: día sin registrar o futuro). */
  dailyExpense: { day: number; current: string | null; previous: string | null }[];
  /** Saldos al final del período (hoy en el mes en curso). */
  balances: {
    asOf: string;
    available: string;
    cardDebt: string;
    netWorth: string;
    /** Ahorro acumulado desde el inicio del registro hasta `asOf`. */
    accumulatedSavings: string;
    accounts: { id: string; name: string; type: AccountType; balance: string }[];
  };
  pending: { count: number; items: TransactionDTO[] };
  /** Cargas por voz que esperan revisión. */
  pendingVoice: PendingVoiceEntry[];
  /** Resúmenes de tarjeta con saldo a pagar, por fecha de vencimiento. */
  upcoming: { cardId: string; name: string; period: string; dueDate: string; amount: string; status: StatementStatus }[];
  recent: TransactionDTO[];
}
