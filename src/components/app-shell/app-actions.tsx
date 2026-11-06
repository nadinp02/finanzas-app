"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TransactionDraft } from "@/modules/transactions/schema";

export interface AppActions {
  openVoice: () => void;
  openQuickAdd: (draft?: TransactionDraft) => void;
}

const AppActionsContext = createContext<AppActions | null>(null);

export function AppActionsProvider({ value, children }: { value: AppActions; children: ReactNode }) {
  return <AppActionsContext value={value}>{children}</AppActionsContext>;
}

export function useAppActions(): AppActions {
  const actions = useContext(AppActionsContext);
  if (!actions) throw new Error("useAppActions requiere AppActionsProvider");
  return actions;
}
