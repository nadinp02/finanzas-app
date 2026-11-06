import { idSchema, nameSchema, z } from "@/lib/validation";
import { CATEGORY_ICON_KEYS } from "./icons";
import { CATEGORY_COLOR_KEYS } from "./palette";

export const createCategorySchema = z.object({
  name: nameSchema(50),
  kind: z.enum(["EXPENSE", "INCOME"]),
  parentId: idSchema.optional(),
  icon: z.enum(CATEGORY_ICON_KEYS),
  color: z.enum(CATEGORY_COLOR_KEYS),
  isFixedDefault: z.boolean().default(false),
});

export const updateCategorySchema = z.object({
  name: nameSchema(50).optional(),
  parentId: idSchema.nullable().optional(),
  icon: z.enum(CATEGORY_ICON_KEYS).optional(),
  color: z.enum(CATEGORY_COLOR_KEYS).optional(),
  isFixedDefault: z.boolean().optional(),
});

export const deleteCategorySchema = z.object({
  reassignTo: idSchema.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface CategoryDTO {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  parentId: string | null;
  icon: string;
  color: string;
  isFixedDefault: boolean;
  sortOrder: number;
}

/** Nombre con su padre: "Salud › Farmacia". */
export function categoryPath(category: CategoryDTO, byId: ReadonlyMap<string, CategoryDTO>): string {
  const parent = category.parentId ? byId.get(category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}
