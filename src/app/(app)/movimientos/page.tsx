import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { addMonths, isYearMonth, lastDayOfMonth, monthOf, todayIn, type YearMonth } from "@/lib/dates";
import { OutboxList } from "@/modules/offline/components/outbox-list";
import { NewTransactionButton } from "@/modules/transactions/components/new-transaction-button";
import { TransactionFeed } from "@/modules/transactions/components/transaction-feed";
import { TransactionFilters } from "@/modules/transactions/components/transaction-filters";
import { transactionFiltersSchema } from "@/modules/transactions/schema";
import { listTransactions } from "@/modules/transactions/service";
import { requireOnboardedUser } from "@/server/auth";

export const metadata: Metadata = { title: "Movimientos" };

export default function MovementsPage({ searchParams }: PageProps<"/movimientos">) {
  return (
    <>
      <PageHeader title="Movimientos" actions={<NewTransactionButton />} />
      <Suspense fallback={<FeedSkeleton />}>
        <Movements searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Movements({ searchParams }: Pick<PageProps<"/movimientos">, "searchParams">) {
  const user = await requireOnboardedUser();
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value) params[key] = value;

  const month = params.mes && isYearMonth(params.mes) ? params.mes : undefined;
  const parsed = transactionFiltersSchema.safeParse({
    ...params,
    ...(month && { from: `${month}-01`, to: lastDayOfMonth(month) }),
  });
  const filters = parsed.success ? parsed.data : transactionFiltersSchema.parse({});
  const { items, nextCursor } = await listTransactions(user.id, filters);

  const today = todayIn(user.timezone);
  const start = user.trackingStartDate ? monthOf(user.trackingStartDate) : monthOf(today);
  const months: YearMonth[] = [];
  for (let m = monthOf(today); m >= start && months.length < 36; m = addMonths(m, -1)) months.push(m);

  const query = new URLSearchParams(
    Object.entries({ ...params, ...(month && { from: `${month}-01`, to: lastDayOfMonth(month) }) }).filter(
      ([key]) => key !== "mes" && key !== "cursor",
    ),
  ).toString();

  return (
    <>
      <TransactionFilters months={months} />
      <OutboxList />
      <TransactionFeed
        initialItems={items}
        initialCursor={nextCursor}
        query={query}
        today={today}
        emptyText={Object.keys(params).length ? "Ningún movimiento coincide con los filtros." : "Todavía no cargaste movimientos."}
      />
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
