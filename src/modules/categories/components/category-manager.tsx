"use client";

import { cn } from "cn";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { categoryTree, useReferenceData } from "@/components/app-shell/reference-data";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { CATEGORY_ICON_KEYS, categoryIcon } from "../icons";
import { CATEGORY_COLOR_KEYS, categoryColor } from "../palette";
import type { CategoryDTO } from "../schema";
import { CategoryChip } from "./category-chip";

type Kind = "EXPENSE" | "INCOME";

interface EditorState {
  category?: CategoryDTO;
  kind: Kind;
  parentId?: string;
}

export function CategoryManager() {
  const { data, refresh } = useReferenceData();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<CategoryDTO | null>(null);
  const tree = categoryTree(data?.categories ?? [], kind);

  const afterChange = () => {
    void refresh().catch(() => {});
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <ChoiceChips label="Tipo" value={kind} options={[{ value: "EXPENSE", label: "Gastos" }, { value: "INCOME", label: "Ingresos" }]} onChange={setKind} />
        <Button size="sm" variant="outline" className="h-10 rounded-full" onClick={() => setEditor({ kind })}>
          <Plus /> Nueva
        </Button>
      </div>
      <div className="grid gap-3">
        {tree.map((node) => (
          <div key={node.id} className="overflow-hidden rounded-2xl border bg-card">
            <CategoryLine category={node} onEdit={() => setEditor({ category: node, kind })} onDelete={() => setDeleting(node)} />
            {node.children.map((child) => (
              <div key={child.id} className="border-t pl-10">
                <CategoryLine category={child} onEdit={() => setEditor({ category: child, kind })} onDelete={() => setDeleting(child)} />
              </div>
            ))}
            <button type="button" onClick={() => setEditor({ kind, parentId: node.id })} className="flex w-full items-center gap-2 border-t px-4 py-2.5 pl-14 text-[13px] font-semibold text-muted-foreground hover:bg-accent/50">
              <Plus className="size-4" /> Subcategoría
            </button>
          </div>
        ))}
      </div>
      {editor && <CategoryEditor state={editor} onClose={() => setEditor(null)} onSaved={afterChange} />}
      {deleting && <DeleteCategoryDialog category={deleting} onClose={() => setDeleting(null)} onDeleted={afterChange} />}
    </>
  );
}

function CategoryLine({ category, onEdit, onDelete }: { category: CategoryDTO; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <CategoryChip icon={category.icon} color={category.color} className="size-9" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {category.name}
        {category.isFixedDefault && <span className="ml-2 text-[12px] font-medium text-muted-foreground">fijo</span>}
      </span>
      <Button size="icon-sm" variant="ghost" aria-label={`Editar ${category.name}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${category.name}`} onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

function CategoryEditor({ state, onClose, onSaved }: { state: EditorState; onClose: () => void; onSaved: () => void }) {
  const { data } = useReferenceData();
  const existing = state.category;
  const [name, setName] = useState(existing?.name ?? "");
  const [parentId, setParentId] = useState(existing?.parentId ?? state.parentId ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "more");
  const [color, setColor] = useState(existing?.color ?? "stone");
  const [isFixedDefault, setFixed] = useState(existing?.isFixedDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const roots = (data?.categories ?? []).filter((c) => c.kind === state.kind && !c.parentId && c.id !== existing?.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await api(`/api/categories/${existing.id}`, { method: "PATCH", body: { name, icon, color, isFixedDefault, parentId: parentId || null } });
      } else {
        await api("/api/categories", { method: "POST", body: { name, kind: state.kind, icon, color, isFixedDefault, parentId: parentId || undefined } });
      }
      toast.success(existing ? "Categoría actualizada" : "Categoría creada");
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
          <SheetTitle className="text-xl font-bold">{existing ? "Editar categoría" : "Nueva categoría"}</SheetTitle>
          <SheetDescription className="sr-only">Nombre, ícono y color de la categoría.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FormField id="category-name" label="Nombre">
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="category-parent" label="Dentro de">
            <select id="category-parent" className="h-11 rounded-xl border border-input bg-card px-3 text-base" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Ninguna (categoría principal)</option>
              {roots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">Ícono</span>
            <div className="grid grid-cols-8 gap-1.5">
              {CATEGORY_ICON_KEYS.map((key) => {
                const Icon = categoryIcon(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    aria-pressed={icon === key}
                    onClick={() => setIcon(key)}
                    className={cn("flex aspect-square items-center justify-center rounded-lg", icon === key ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">Color</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={color === key}
                  onClick={() => setColor(key)}
                  className={cn("size-9 rounded-full ring-offset-2 ring-offset-background", color === key && "ring-2 ring-primary")}
                  style={{ backgroundColor: categoryColor(key) }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
            <span className="text-[15px] font-semibold">Marcar como fijo por defecto</span>
            <Switch checked={isFixedDefault} onCheckedChange={setFixed} />
          </label>
          {error && <p role="alert" className="text-sm font-medium text-negative">{error}</p>}
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DeleteCategoryDialog({ category, onClose, onDeleted }: { category: CategoryDTO; onClose: () => void; onDeleted: () => void }) {
  const { data } = useReferenceData();
  const [inUse, setInUse] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const options = (data?.categories ?? []).filter((c) => c.kind === category.kind && c.id !== category.id && c.parentId !== category.id);

  async function remove() {
    setBusy(true);
    try {
      const query = target ? `?reassignTo=${target}` : "";
      await api(`/api/categories/${category.id}${query}`, { method: "DELETE" });
      toast("Categoría eliminada");
      onDeleted();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === "CATEGORY_IN_USE") setInUse(error.message);
      else toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="gap-0 px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="mb-4 p-0 pr-10">
          <SheetTitle className="text-xl font-bold">Eliminar «{category.name}»</SheetTitle>
          <SheetDescription>{inUse ?? "Si no tiene movimientos se elimina directamente."}</SheetDescription>
        </SheetHeader>
        {inUse && (
          <FormField id="reassign" label="Mover sus movimientos a">
            <select id="reassign" className="h-11 rounded-xl border border-input bg-card px-3 text-base" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Elegí una categoría</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <div className="mt-5 grid gap-2">
          <Button variant="destructive" size="lg" disabled={busy || (inUse !== null && !target)} onClick={remove}>
            {busy && <Loader2 className="animate-spin" />} {inUse ? "Mover y eliminar" : "Eliminar"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
