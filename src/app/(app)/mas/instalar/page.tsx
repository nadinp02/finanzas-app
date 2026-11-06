import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { InstallGuide } from "@/modules/settings/components/install-guide";

export const metadata: Metadata = { title: "Instalar" };

export default function InstallPage() {
  return (
    <>
      <PageHeader eyebrow="Más" title="Instalar la app" />
      <p className="mb-5 text-[15px] text-muted-foreground">
        Instalada se abre como una app, con acceso directo al micrófono y carga de movimientos sin conexión.
      </p>
      <InstallGuide />
    </>
  );
}
