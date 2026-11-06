import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { OfflineQuickAdd } from "@/modules/offline/components/offline-quick-add";

export const metadata: Metadata = { title: "Sin conexión" };

/** Se muestra cuando una página no está en caché y no hay red. Permite seguir cargando gastos. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 pt-safe pb-safe">
      <BrandMark className="size-11" />
      <h1 className="mt-6 flex items-center gap-2 text-[26px] font-bold">
        <WifiOff className="size-6" /> Sin conexión
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        Esta pantalla no está disponible sin internet. Podés anotar movimientos igual: se guardan en el teléfono y se
        sincronizan cuando vuelva la conexión.
      </p>
      <div className="mt-8">
        <OfflineQuickAdd />
      </div>
    </main>
  );
}
