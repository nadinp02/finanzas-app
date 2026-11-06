import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingForm } from "@/modules/onboarding/components/onboarding-form";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Bienvenida" };

export default function WelcomePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pt-safe pb-16">
      <div className="pt-10 pb-8">
        <BrandMark className="size-11" />
        <h1 className="mt-5 text-[28px] leading-tight font-bold">Empecemos con tus saldos de hoy</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Tarda un par de minutos. Después podés agregar o corregir cuentas cuando quieras.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <Onboarding />
      </Suspense>
    </main>
  );
}

async function Onboarding() {
  const user = await requireUser();
  if (user.onboarded) redirect("/");
  return <OnboardingForm timezone={user.timezone} />;
}
