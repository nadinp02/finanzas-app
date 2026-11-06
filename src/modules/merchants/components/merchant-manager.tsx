"use client";

import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { normalizeText } from "@/lib/text";
import type { MerchantDTO } from "../schema";

export function MerchantManager() {
  const { data, refresh } = useReferenceData();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MerchantDTO | "new" | null>(null);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const merchants = (data?.merchants ?? []).filter((m) => normalizeText(m.name).includes(normalizeText(query)));

  async function remove(merchant: MerchantDTO) {
    if (!window.confirm(`¿Eliminar ${merchant.name}? Los movimientos quedan sin comercio.`)) return;
    try {
      await api(`/api/merchants/${merchant.id}`, { method: "DELETE" });
      toast("Comercio eliminado");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Buscar comercios" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus /> Nuevo
        </Button>
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {merchants.map((merchant) => {
          const category = merchant.defaultCategoryId ? categories.get(merchant.defaultCategoryId) : undefined;
          return (
            <div key={merchant.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{merchant.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {category ? category.name : "Sin categoría habitual"}
                  {merchant.usageCount > 0 && ` · ${merchant.usageCount} ${merchant.usageCount === 1 ? "uso" : "usos"}`}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`Editar ${merchant.name}`} onClick={() => setEditing(merchant)}>
                <Pencil />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${merchant.name}`} onClick={() => remove(merchant)}>
                <Trash2 />
              </Button>
            </div>
          );
        })}
        {merchants.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No hay comercios.</p>}
      </div>
      {editing && <MerchantEditor merchant={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}
    </>
  );
}

function MerchantEditor({ merchant, onClose, onSaved }: { merchant?: MerchantDTO; onClose: () => void; onSaved: () => void }) {
  const { data } = useReferenceData();
  const [name, setName] = useState(merchant?.name ?? "");
  const [aliases, setAliases] = useState((merchant?.aliases ?? []).join(", "));
  const [categoryId, setCategoryId] = useState(merchant?.defaultCategoryId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name,
      aliases: aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
      defaultCategoryId: categoryId || null,
    };
    try {
      if (merchant) await api(`/api/merchants/${merchant.id}`, { method: "PATCH", body });
      else await api("/api/merchants", { method: "POST", body });
      toast.success("Comercio guardado");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields)[0]! : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="gap-0 overflow-y-auto px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="mb-4 p-0 pr-10">
          <SheetTitle className="text-xl font-bold">{merchant ? "Editar comercio" : "Nuevo comercio"}</SheetTitle>
          <SheetDescription>Las variantes ayudan a reconocerlo cuando lo dictás.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FormField id="merchant-name" label="Nombre">
            <Input id="merchant-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="merchant-aliases" label="Variantes (separadas por coma)" hint="Ej.: farma city, farmaciti">
            <Input id="merchant-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </FormField>
          <FormField id="merchant-category" label="Categoría habitual">
            <select id="merchant-category" className="h-11 rounded-xl border border-input bg-card px-3 text-base" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría habitual</option>
              {(data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `   ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </FormField>
          {error && <p role="alert" className="text-sm font-medium text-negative">{error}</p>}
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
