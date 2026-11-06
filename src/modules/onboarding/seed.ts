import "server-only";
import { normalizeText } from "@/lib/text";
import type { Tx } from "@/server/db";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_MERCHANTS,
  type DefaultCategory,
} from "@/modules/categories/defaults";

/** Crea las categorías y comercios iniciales de una usuaria nueva. */
export async function seedUserDefaults(tx: Tx, userId: string): Promise<void> {
  const idByPath = new Map<string, string>();

  const createTree = async (kind: "EXPENSE" | "INCOME", tree: DefaultCategory[]) => {
    for (const [index, category] of tree.entries()) {
      const parent = await tx.category.create({
        data: {
          userId,
          kind,
          name: category.name,
          icon: category.icon,
          color: category.color,
          isFixedDefault: category.isFixedDefault ?? false,
          sortOrder: index,
        },
      });
      idByPath.set(category.name, parent.id);
      for (const [childIndex, child] of (category.children ?? []).entries()) {
        const created = await tx.category.create({
          data: {
            userId,
            kind,
            parentId: parent.id,
            name: child.name,
            icon: child.icon,
            color: category.color,
            isFixedDefault: child.isFixedDefault ?? category.isFixedDefault ?? false,
            sortOrder: childIndex,
          },
        });
        idByPath.set(`${category.name} › ${child.name}`, created.id);
      }
    }
  };

  await createTree("EXPENSE", DEFAULT_EXPENSE_CATEGORIES);
  await createTree("INCOME", DEFAULT_INCOME_CATEGORIES);

  await tx.merchant.createMany({
    data: DEFAULT_MERCHANTS.map((merchant) => ({
      userId,
      name: merchant.name,
      normalizedName: normalizeText(merchant.name),
      aliases: (merchant.aliases ?? []).map(normalizeText),
      defaultCategoryId: idByPath.get(merchant.category) ?? null,
    })),
  });
}
