import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { MerchantManager } from "@/modules/merchants/components/merchant-manager";

export const metadata: Metadata = { title: "Comercios" };

export default function MerchantsPage() {
  return (
    <>
      <PageHeader eyebrow="Más" title="Comercios" />
      <MerchantManager />
    </>
  );
}
