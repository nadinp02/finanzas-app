"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TransactionDraft } from "@/modules/transactions/schema";
import { TransactionSheet } from "@/modules/transactions/components/transaction-sheet";
import { useOutboxSync } from "@/modules/offline/use-outbox";
import { VoiceSheet, type VoiceSheetHandle } from "@/modules/voice/components/voice-sheet";
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
  const voice = useRef<VoiceSheetHandle>(null);
  // Se llama dentro del toque: iOS solo da el micrófono durante el gesto del usuario.
  const openVoice = useCallback(() => voice.current?.openAndRecord(), []);
  const openVoiceEntry = useCallback((id: string) => voice.current?.openEntry(id), []);
  const actions = useMemo(() => ({ openQuickAdd, openVoice, openVoiceEntry }), [openQuickAdd, openVoice, openVoiceEntry]);

  // Accesos directos del manifest: /?nuevo=1 y /?voz=1 (sin gesto: la voz abre sin grabar).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("nuevo") && !params.has("voz")) return;
    window.history.replaceState(null, "", window.location.pathname);
    const timer = window.setTimeout(() => {
      if (params.has("voz")) voice.current?.open();
      else setQuickAdd({ open: true });
    }, 0);
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
      <VoiceSheet ref={voice} onManualEntry={() => openQuickAdd()} />
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
