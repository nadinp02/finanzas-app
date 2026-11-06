"use client";

import { cn } from "cn";
import {
  ArrowLeftRight,
  House,
  LayoutGrid,
  Mic,
  PiggyBank,
  Plus,
  Repeat,
  Tags,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/app";
import { useAppActions } from "./app-actions";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
  { href: "/mas", label: "Más", icon: LayoutGrid },
];

const DESKTOP: NavItem[] = [
  PRIMARY[0]!,
  PRIMARY[1]!,
  PRIMARY[2]!,
  { href: "/ahorros", label: "Ahorros", icon: PiggyBank },
  { href: "/recurrentes", label: "Recurrentes", icon: Repeat },
  { href: "/mas/categorias", label: "Categorías", icon: Tags },
  { href: "/mas", label: "Más", icon: LayoutGrid },
];

function isActive(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  if (href === "/mas") return pathname === "/mas" || (pathname.startsWith("/mas/") && !pathname.startsWith("/mas/categorias"));
  if (href === "/cuentas") return pathname.startsWith("/cuentas") || pathname.startsWith("/tarjetas");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * La ruta actual es dato de request: con Cache Components la navegación se renderiza dentro de
 * <Suspense> y el fallback es la misma barra sin el ítem activo (`pathname = null`).
 */
export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

export function BottomNavView({ pathname }: { pathname: string | null }) {
  const { openVoice } = useAppActions();
  const [first, second, third, fourth] = PRIMARY as [NavItem, NavItem, NavItem, NavItem];

  const item = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} />
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/92 backdrop-blur-md pb-safe lg:hidden"
    >
      <div className="mx-auto flex h-[var(--bottom-nav-height)] max-w-lg items-stretch px-2">
        {item(first)}
        {item(second)}
        <div className="flex flex-1 items-start justify-center">
          <button
            type="button"
            onClick={openVoice}
            aria-label="Cargar por voz"
            className="-mt-5 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_24px_-8px_oklch(0.2_0.01_262_/_0.55)] ring-4 ring-background transition-transform active:scale-95"
          >
            <Mic className="size-7" strokeWidth={2.2} />
          </button>
        </div>
        {item(third)}
        {item(fourth)}
      </div>
    </nav>
  );
}

export function Sidebar() {
  return <SidebarView pathname={usePathname()} />;
}

export function SidebarView({ pathname }: { pathname: string | null }) {
  const { openVoice, openQuickAdd } = useAppActions();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
        <BrandMark className="size-8" />
        <span className="text-[17px] font-bold tracking-tight">{APP_NAME}</span>
      </Link>
      <div className="mb-6 grid gap-2">
        <Button onClick={openVoice} size="lg" className="justify-start">
          <Mic /> Dictar movimiento
        </Button>
        <Button onClick={() => openQuickAdd()} variant="outline" size="lg" className="justify-start">
          <Plus /> Nuevo movimiento
        </Button>
      </div>
      <nav aria-label="Secciones" className="grid gap-0.5">
        {DESKTOP.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href + label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
