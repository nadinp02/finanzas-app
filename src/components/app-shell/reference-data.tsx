"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import type { CategoryDTO } from "@/modules/categories/schema";
import type { BootstrapData } from "@/modules/settings/service";
import { loadCachedBootstrap, saveCachedBootstrap } from "@/modules/offline/storage";

interface ReferenceDataContextValue {
  data: BootstrapData | null;
  /** Vuelve a pedir los datos (después de crear cuentas, categorías, etc.). */
  refresh: () => Promise<void>;
}

const ReferenceDataContext = createContext<ReferenceDataContextValue | null>(null);

async function fetchBootstrap(): Promise<BootstrapData> {
  const fresh = await api<BootstrapData>("/api/bootstrap");
  await saveCachedBootstrap(fresh);
  return fresh;
}

/**
 * Cuentas, categorías y comercios para los formularios. Se muestran primero los guardados en el
 * dispositivo (permiten cargar sin conexión) y se actualizan desde el servidor.
 */
export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null);

  const refresh = useCallback(async () => {
    setData(await fetchBootstrap());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCachedBootstrap().then((cached) => {
      if (!cancelled && cached) setData((current) => current ?? cached);
    });
    fetchBootstrap()
      .then((fresh) => {
        if (!cancelled) setData(fresh);
      })
      .catch(() => {
        // Sin conexión: se sigue con la copia local.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ data, refresh }), [data, refresh]);
  return <ReferenceDataContext value={value}>{children}</ReferenceDataContext>;
}

export function useReferenceData(): ReferenceDataContextValue {
  const context = useContext(ReferenceDataContext);
  if (!context) throw new Error("useReferenceData requiere ReferenceDataProvider");
  return context;
}

export interface CategoryNode extends CategoryDTO {
  children: CategoryDTO[];
}

export function categoryTree(categories: CategoryDTO[], kind: "EXPENSE" | "INCOME"): CategoryNode[] {
  const roots = categories.filter((category) => category.kind === kind && !category.parentId);
  return roots.map((root) => ({ ...root, children: categories.filter((category) => category.parentId === root.id) }));
}
