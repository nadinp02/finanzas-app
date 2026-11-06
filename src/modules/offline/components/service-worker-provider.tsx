"use client";

import { SerwistProvider } from "@serwist/next/react";
import type { ReactNode } from "react";

export function ServiceWorkerProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      // El service worker solo existe en builds de producción (`serwist build`).
      disable={process.env.NODE_ENV !== "production"}
      // Recargar al volver la conexión interrumpiría formularios y la sincronización propia.
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
