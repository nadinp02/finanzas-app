"use client";

import { Plus, RotateCw } from "lucide-react";
import { useState } from "react";
import { AppActionsProvider } from "@/components/app-shell/app-actions";
import { ReferenceDataProvider } from "@/components/app-shell/reference-data";
import { Button } from "@/components/ui/button";
import { TransactionSheet } from "@/modules/transactions/components/transaction-sheet";
import { OutboxList } from "./outbox-list";

/** Carga manual disponible desde la página sin conexión, con los datos guardados en el dispositivo. */
export function OfflineQuickAdd() {
  const [open, setOpen] = useState(false);
  return (
    <ReferenceDataProvider>
      <AppActionsProvider value={{ openQuickAdd: () => setOpen(true), openVoice: () => setOpen(true) }}>
        <div className="grid gap-3">
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus /> Anotar un movimiento
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
            <RotateCw /> Reintentar conexión
          </Button>
        </div>
        <div className="mt-8">
          <OutboxList />
        </div>
        <TransactionSheet open={open} onOpenChange={setOpen} />
      </AppActionsProvider>
    </ReferenceDataProvider>
  );
}
