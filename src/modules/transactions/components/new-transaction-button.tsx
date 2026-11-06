"use client";

import { Plus } from "lucide-react";
import { useAppActions } from "@/components/app-shell/app-actions";
import { Button } from "@/components/ui/button";
import type { TransactionDraft } from "../schema";

export function NewTransactionButton({ draft, label = "Nuevo" }: { draft?: TransactionDraft; label?: string }) {
  const { openQuickAdd } = useAppActions();
  return (
    <Button size="sm" variant="outline" onClick={() => openQuickAdd(draft)} className="h-10 rounded-full px-4">
      <Plus /> {label}
    </Button>
  );
}
