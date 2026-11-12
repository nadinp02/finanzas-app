import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

/** Marco común de las pantallas sin sesión: ingresar, crear cuenta y recuperar la contraseña. */
export function AuthPage({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 pt-safe pb-safe">
      <div className="mb-10">
        <BrandMark className="size-12" />
        <h1 className="mt-6 text-[28px] leading-tight font-bold">{title}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p>
      </div>
      {children}
      {footer && <div className="mt-8 grid gap-3 text-center text-[15px]">{footer}</div>}
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function FormAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={tone === "error" ? "rounded-xl bg-negative-soft px-3.5 py-3 text-sm font-medium text-negative" : "rounded-xl bg-secondary px-3.5 py-3 text-sm font-medium"}
    >
      {children}
    </p>
  );
}
