import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { isYearMonth, monthOf, todayIn } from "@/lib/dates";
import { DashboardView, MonthSwitcher } from "@/modules/reports/components/dashboard-view";
import { getDashboard } from "@/modules/reports/service";
import { requireOnboardedUser } from "@/server/auth";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

async function Home({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const user = await requireOnboardedUser();
  const { mes } = await searchParams;
  const today = todayIn(user.timezone);
  // Un mes inválido o futuro en la URL muestra el mes actual en lugar de un error.
  const month = typeof mes === "string" && isYearMonth(mes) && mes <= monthOf(today) ? mes : undefined;
  const data = await getDashboard(user, month, today);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 pt-6 pb-5 lg:pt-10">
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Hola, {user.name}</h1>
        <MonthSwitcher data={data} />
      </header>
      <DashboardView data={data} />
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid gap-4 pt-6">
      <Skeleton className="h-9 w-48 rounded-xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}
