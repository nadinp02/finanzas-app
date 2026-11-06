import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { CategoryManager } from "@/modules/categories/components/category-manager";

export const metadata: Metadata = { title: "Categorías" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader eyebrow="Más" title="Categorías" />
      <CategoryManager />
    </>
  );
}
