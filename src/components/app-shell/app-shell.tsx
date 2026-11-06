"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TransactionDraft } from "@/modules/transactions/schema";
import { TransactionSheet } from "@/modules/transactions/components/transaction-sheet";
import { useOutboxSync } from "@/modules/offline/use-outbox";
import { AppActionsProvider } from "./app-actions";
import { BottomNav, BottomNavView, Sidebar, SidebarView } from "./navigation";
import { ReferenceDataProvider } from "./reference-data";

/**
 * iOS solo abre el teclado si el foco ocurre dentro del gesto del usuario. Se enfoca un input
 * auxiliar en el mismo toque y el formulario mueve el foco al importe al montarse.
 */
function focusKeyboardProxy() {
  let proxy = document.getElementById("keyboard-proxy") as HTMLInputElement | null;
  if (!proxy) {
    proxy = document.createElement("input");
    proxy.id = "keyboard-proxy";
    proxy.setAttribute("aria-hidden", "true");
    proxy.tabIndex = -1;
    proxy.inputMode = "decimal";
    Object.assign(proxy.style, { position: "fixed", top: "0", left: "0", opacity: "0", height: "0", fontSize: "16px" });
    document.body.appendChild(proxy);
  }
  proxy.focus();
}

function AppShellInner({ children }: { children: ReactNode }) {
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; draft?: TransactionDraft }>({ open: false });
  useOutboxSync();

  const openQuickAdd = useCallback((draft?: TransactionDraft) => {
    focusKeyboardProxy();
    setQuickAdd({ open: true, draft });
  }, []);
  // La carga por voz se conecta en la fase 4; mientras tanto el micrófono abre la carga manual.
  const openVoice = useCallback(() => openQuickAdd(), [openQuickAdd]);
  const actions = useMemo(() => ({ openQuickAdd, openVoice }), [openQuickAdd, openVoice]);

  // Accesos directos del manifest: /?nuevo=1 y /?voz=1. Se abre después del primer pintado.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("nuevo") && !params.has("voz")) return;
    window.history.replaceState(null, "", window.location.pathname);
    const timer = window.setTimeout(() => setQuickAdd({ open: true }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AppActionsProvider value={actions}>
      <div className="flex min-h-dvh">
        <Suspense fallback={<SidebarView pathname={null} />}>
          <Sidebar />
        </Suspense>
        <main className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-4 pt-safe pb-safe-nav sm:px-6 lg:px-10 lg:pb-16">{children}</main>
      </div>
      <Suspense fallback={<BottomNavView pathname={null} />}>
        <BottomNav />
      </Suspense>
      <TransactionSheet
        open={quickAdd.open}
        draft={quickAdd.draft}
        onOpenChange={(open) => setQuickAdd((current) => ({ ...current, open }))}
      />
    </AppActionsProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ReferenceDataProvider>
      <AppShellInner>{children}</AppShellInner>
    </ReferenceDataProvider>
  );
}
