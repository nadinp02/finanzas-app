"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApiError, errorMessage } from "@/lib/api-client";
import { formatMoney, parseDecimal } from "@/lib/money";
import { submitNewTransaction } from "@/modules/offline/outbox";
import { deleteTransactionRequest, updateTransactionRequest } from "../client";
import { TRANSACTION_TYPE_LABELS, type TransactionDraft, type TransactionDTO, type TransactionInput } from "../schema";
import { defaultFormValues, TransactionForm, valuesFromTransaction } from "./transaction-form";

interface TransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: TransactionDraft;
  /** Si se pasa, el formulario edita ese movimiento. */
  transaction?: TransactionDTO;
  onDeleted?: () => void;
}

export function TransactionSheet({ open, onOpenChange, draft, transaction, onDeleted }: TransactionSheetProps) {
  const router = useRouter();
  const { data, refresh } = useReferenceData();

  async function create(input: TransactionInput) {
    try {
      const result = await submitNewTransaction(input);
      onOpenChange(false);
      const label = `${TRANSACTION_TYPE_LABELS[input.type]} · ${formatMoney(parseDecimal(input.amount))}`;
      if (result.status === "queued") {
        toast(`${label} guardado sin conexión`, { description: "Se sincroniza solo cuando vuelva la conexión." });
      } else {
        const saved = result.transaction;
        toast.success(`${label} guardado`, {
          action: {
            label: "Deshacer",
            onClick: async () => {
              try {
                await deleteTransactionRequest(saved.id, saved.version);
                toast("Movimiento deshecho");
                router.refresh();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            },
          },
        });
      }
      router.refresh();
      // El comercio pudo ser nuevo: se actualizan las sugerencias.
      void refresh().catch(() => {});
    } catch (error) {
      if (error instanceof ApiError && error.fields) throw error;
      toast.error(errorMessage(error));
    }
  }

  async function update(input: TransactionInput) {
    if (!transaction) return;
    try {
      await updateTransactionRequest(transaction.id, transaction.version, input);
      toast.success("Cambios guardados");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        toast.error(error.message);
        onOpenChange(false);
        router.refresh();
        return;
      }
      toast.error(errorMessage(error));
    }
  }

  async function remove() {
    if (!transaction) return;
    try {
      await deleteTransactionRequest(transaction.id, transaction.version);
      toast("Movimiento eliminado");
      onOpenChange(false);
      onDeleted?.();
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const timezone = data?.user.timezone ?? "America/Argentina/Cordoba";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 overflow-y-auto px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="mb-4 p-0 pr-10">
          <SheetTitle className="text-xl font-bold">{transaction ? "Editar movimiento" : "Nuevo movimiento"}</SheetTitle>
          <SheetDescription className="sr-only">Completá el importe, la categoría y la cuenta.</SheetDescription>
        </SheetHeader>
        {!data ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          open && (
            <TransactionForm
              key={transaction?.id ?? "new"}
              mode={transaction ? "edit" : "create"}
              initial={transaction ? valuesFromTransaction(transaction) : defaultFormValues(draft, data.user.defaultAccountId, timezone)}
              onSubmit={transaction ? update : create}
              onDelete={transaction ? remove : undefined}
            />
          )
        )}
      </SheetContent>
    </Sheet>
  );
}
