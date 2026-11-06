import "server-only";
import { errors } from "@/lib/errors";
import { normalizeText } from "@/lib/text";
import { audit } from "@/server/audit";
import { prisma, transaction, type Tx } from "@/server/db";
import type { CategoryDTO, CreateCategoryInput, UpdateCategoryInput } from "./schema";

export async function listCategories(userId: string, db: Tx = prisma): Promise<CategoryDTO[]> {
  const categories = await db.category.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, parentId: true, icon: true, color: true, isFixedDefault: true, sortOrder: true },
  });
  return categories;
}

export async function getOwnedCategory(userId: string, id: string, db: Tx = prisma) {
  const category = await db.category.findFirst({ where: { id, userId } });
  if (!category) throw errors.notFound("No encontramos esa categoría.");
  return category;
}

async function assertUniqueSiblingName(db: Tx, userId: string, kind: string, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await db.category.findMany({
    where: { userId, kind: kind as never, parentId, ...(exceptId && { id: { not: exceptId } }) },
    select: { name: true },
  });
  if (siblings.some((sibling) => normalizeText(sibling.name) === normalizeText(name))) {
    throw errors.validation({ name: "Ya existe una categoría con ese nombre en el mismo nivel." });
  }
}

/** Un solo nivel de subcategorías: el padre debe ser raíz y del mismo tipo. */
async function assertValidParent(db: Tx, userId: string, kind: string, parentId: string, selfId?: string) {
  if (parentId === selfId) throw errors.validation({ parentId: "Una categoría no puede contenerse a sí misma." });
  const parent = await getOwnedCategory(userId, parentId, db);
  if (parent.parentId) throw errors.validation({ parentId: "Las subcategorías no pueden tener subcategorías." });
  if (parent.kind !== kind) throw errors.validation({ parentId: "La categoría padre debe ser del mismo tipo." });
}

export async function createCategory(userId: string, input: CreateCategoryInput): Promise<CategoryDTO> {
  return transaction(async (tx) => {
    if (input.parentId) await assertValidParent(tx, userId, input.kind, input.parentId);
    await assertUniqueSiblingName(tx, userId, input.kind, input.parentId ?? null, input.name);
    const count = await tx.category.count({ where: { userId, kind: input.kind, parentId: input.parentId ?? null } });
    const category = await tx.category.create({
      data: { userId, ...input, parentId: input.parentId ?? null, sortOrder: count },
      select: { id: true, name: true, kind: true, parentId: true, icon: true, color: true, isFixedDefault: true, sortOrder: true },
    });
    await audit({ userId, action: "CREATE", entityType: "Category", entityId: category.id }, tx);
    return category;
  });
}

export async function updateCategory(userId: string, id: string, input: UpdateCategoryInput): Promise<void> {
  await transaction(async (tx) => {
    const category = await getOwnedCategory(userId, id, tx);
    const parentId = input.parentId === undefined ? category.parentId : input.parentId;
    if (input.parentId) {
      await assertValidParent(tx, userId, category.kind, input.parentId, id);
      if (await tx.category.count({ where: { parentId: id } })) {
        throw errors.validation({ parentId: "Una categoría con subcategorías no puede pasar a ser subcategoría." });
      }
    }
    if (input.name || input.parentId !== undefined) {
      await assertUniqueSiblingName(tx, userId, category.kind, parentId, input.name ?? category.name, id);
    }
    await tx.category.update({
      where: { id },
      data: { name: input.name, icon: input.icon, color: input.color, isFixedDefault: input.isFixedDefault, parentId },
    });
    await audit({ userId, action: "UPDATE", entityType: "Category", entityId: id }, tx);
  });
}

/**
 * Elimina una categoría. Si tiene movimientos o reglas, exige `reassignTo` (misma clase de
 * categoría) y los mueve en la misma transacción antes de borrarla.
 */
export async function deleteCategory(userId: string, id: string, reassignTo?: string): Promise<{ reassigned: number }> {
  return transaction(async (tx) => {
    const category = await getOwnedCategory(userId, id, tx);
    if (await tx.category.count({ where: { parentId: id } })) {
      throw errors.conflict("CATEGORY_HAS_CHILDREN", "Primero eliminá o mové sus subcategorías.");
    }
    const transactions = await tx.transaction.count({ where: { categoryId: id } });
    const rules = await tx.recurringRule.count({ where: { categoryId: id } });
    if (transactions + rules > 0) {
      if (!reassignTo) {
        throw errors.conflict(
          "CATEGORY_IN_USE",
          `La categoría tiene ${transactions} movimiento(s) y ${rules} regla(s). Elegí a qué categoría moverlos.`,
          { transactions, rules },
        );
      }
      if (reassignTo === id) throw errors.validation({ reassignTo: "Elegí otra categoría." });
      const target = await getOwnedCategory(userId, reassignTo, tx);
      if (target.kind !== category.kind) throw errors.validation({ reassignTo: "La categoría destino debe ser del mismo tipo." });
      await tx.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: reassignTo } });
      await tx.recurringRule.updateMany({ where: { categoryId: id }, data: { categoryId: reassignTo } });
      await tx.merchant.updateMany({ where: { defaultCategoryId: id }, data: { defaultCategoryId: reassignTo } });
    }
    await tx.category.delete({ where: { id } });
    await audit(
      { userId, action: "DELETE", entityType: "Category", entityId: id, metadata: { reassignTo: reassignTo ?? null, transactions } },
      tx,
    );
    return { reassigned: transactions };
  });
}
