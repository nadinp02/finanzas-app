import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PreferencesForm } from "@/modules/settings/components/preferences-form";

export const metadata: Metadata = { title: "Preferencias" };

export default function PreferencesPage() {
  return (
    <>
      <PageHeader eyebrow="Más" title="Preferencias" />
      <PreferencesForm />
    </>
  );
}
