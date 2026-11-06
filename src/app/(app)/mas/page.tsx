import { ChevronRight, Download, PiggyBank, Repeat, Settings, Store, Tags, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { LogoutButton } from "@/modules/settings/components/logout-button";

export const metadata: Metadata = { title: "Más" };

const ITEMS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/ahorros", label: "Ahorros", description: "Ahorro mensual, acumulado y objetivos", icon: PiggyBank },
  { href: "/recurrentes", label: "Recurrentes", description: "Servicios, suscripciones, sueldo", icon: Repeat },
  { href: "/mas/categorias", label: "Categorías", description: "Crear, editar y reordenar", icon: Tags },
  { href: "/mas/comercios", label: "Comercios", description: "Categorías habituales y nombres para la voz", icon: Store },
  { href: "/mas/preferencias", label: "Preferencias", description: "Cuenta habitual, voz y contraseña", icon: Settings },
  { href: "/mas/instalar", label: "Instalar la app", description: "Agregarla a la pantalla de inicio", icon: Download },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="Más" />
      <nav className="divide-y overflow-hidden rounded-2xl border bg-card">
        {ITEMS.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/50">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-secondary">
              <Icon className="size-[1.1rem]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{label}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{description}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </>
  );
}
