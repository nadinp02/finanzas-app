import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { PageHeader, Section } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLongDate, todayIn } from "@/lib/dates";
import { AccountDetailActions } from "@/modules/accounts/components/account-actions";
import { ACCOUNT_TYPE_LABELS } from "@/modules/accounts/rules";
import { listAccounts } from "@/modules/accounts/service";
import { NewTransactionButton } from "@/modules/transactions/components/new-transaction-button";
import { TransactionFeed } from "@/modules/transactions/components/transaction-feed";
import { listTransactions } from "@/modules/transactions/service";
import { requireOnboardedUser } from "@/server/auth";

export const metadata: Metadata = { title: "Cuenta" };

export default function AccountPage({ params }: PageProps<"/cuentas/[id]">) {
  return (
    <>
      <Link href="/cuentas" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="size-4" /> Cuentas
      </Link>
      <Suspense fallback={<Skeleton className="mt-6 h-96 rounded-2xl" />}>
        <AccountDetail params={params} />
      </Suspense>
    </>
  );
}

async function AccountDetail({ params }: Pick<PageProps<"/cuentas/[id]">, "params">) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const today = todayIn(user.timezone);
  const account = (await listAccounts(user.id, today)).find((a) => a.id === id);
  if (!account) notFound();
  if (account.type === "CREDIT_CARD") redirect(`/tarjetas/${id}`);
  const { items, nextCursor } = await listTransactions(user.id, { accountId: id, limit: 30 });

  return (
    <>
      <PageHeader
        eyebrow={`${ACCOUNT_TYPE_LABELS[account.type as keyof typeof ACCOUNT_TYPE_LABELS]}${account.isActive ? "" : " · inactiva"}`}
        title={account.name}
        actions={<NewTransactionButton draft={{ accountId: account.id }} />}
      />
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Saldo actual</p>
        <Amount value={account.balance} className="block text-[36px] leading-tight font-bold" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          Saldo inicial <Amount value={account.openingBalance} tone="muted" /> al {formatLongDate(account.openingDate)}
        </p>
      </div>
      <AccountDetailActions account={account} />
      <Section title="Movimientos">
        <TransactionFeed initialItems={items} initialCursor={nextCursor} query={`accountId=${id}&limit=30`} today={today} />
      </Section>
    </>
  );
}
