import { cn } from "cn";
import { CircleEllipsis } from "lucide-react";
import { CATEGORY_ICONS, type CategoryIconKey } from "../icons";
import { categoryColor } from "../palette";

/** Ícono de categoría sobre un fondo suave de su color. */
export function CategoryChip({ icon, color, className }: { icon: string; color: string; className?: string }) {
  // Búsqueda directa en el mapa estático: el componente no se crea durante el render.
  const Icon = CATEGORY_ICONS[icon as CategoryIconKey] ?? CircleEllipsis;
  const value = categoryColor(color);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", className)}
      style={{ backgroundColor: `color-mix(in oklch, ${value} 13%, white)`, color: value }}
    >
      <Icon className="size-[1.15rem]" strokeWidth={2} />
    </span>
  );
}
