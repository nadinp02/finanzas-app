import "server-only";
import { errors } from "@/lib/errors";
import { normalizeText } from "@/lib/text";
import { audit } from "@/server/audit";
import { prisma, transaction, type Tx } from "@/server/db";
import type { CreateMerchantInput, MerchantDTO, UpdateMerchantInput } from "./schema";

const merchantSelect = { id: true, name: true, aliases: true, defaultCategoryId: true, usageCount: true } as const;

export async function listMerchants(userId: string, db: Tx = prisma): Promise<MerchantDTO[]> {
  return db.merchant.findMany({
    where: { userId },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    select: merchantSelect,
  });
}

/** Comercios más usados: palabras clave para el reconocimiento de voz. */
export async function topMerchantNames(userId: string, limit = 60): Promise<string[]> {
  const merchants = await prisma.merchant.findMany({
    where: { userId },
    orderBy: [{ usageCount: "desc" }, { lastUsedAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    take: limit,
    select: { name: true },
  });
  return merchants.map((merchant) => merchant.name);
}

async function assertCategory(db: Tx, userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await db.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw errors.validation({ defaultCategoryId: "Categoría inválida." });
}

export async function createMerchant(userId: string, input: CreateMerchantInput): Promise<MerchantDTO> {
  return transaction(async (tx) => {
    await assertCategory(tx, userId, input.defaultCategoryId);
    const normalizedName = normalizeText(input.name);
    if (await tx.merchant.findUnique({ where: { userId_normalizedName: { userId, normalizedName } } })) {
      throw errors.validation({ name: "Ya existe un comercio con ese nombre." });
    }
    const merchant = await tx.merchant.create({
      data: {
        userId,
        name: input.name,
        normalizedName,
        aliases: input.aliases.map(normalizeText).filter(Boolean),
        defaultCategoryId: input.defaultCategoryId ?? null,
      },
      select: merchantSelect,
    });
    await audit({ userId, action: "CREATE", entityType: "Merchant", entityId: merchant.id }, tx);
    return merchant;
  });
}

export async function updateMerchant(userId: string, id: string, input: UpdateMerchantInput): Promise<void> {
  await transaction(async (tx) => {
    const merchant = await tx.merchant.findFirst({ where: { id, userId } });
    if (!merchant) throw errors.notFound("No encontramos ese comercio.");
    await assertCategory(tx, userId, input.defaultCategoryId);
    let normalizedName: string | undefined;
    if (input.name) {
      normalizedName = normalizeText(input.name);
      const clash = await tx.merchant.findFirst({ where: { userId, normalizedName, id: { not: id } } });
      if (clash) throw errors.validation({ name: "Ya existe un comercio con ese nombre." });
    }
    await tx.merchant.update({
      where: { id },
      data: {
        name: input.name,
        normalizedName,
        aliases: input.aliases?.map(normalizeText).filter(Boolean),
        defaultCategoryId: input.defaultCategoryId,
      },
    });
  });
}

export async function deleteMerchant(userId: string, id: string): Promise<void> {
  const { count } = await prisma.merchant.deleteMany({ where: { id, userId } });
  if (!count) throw errors.notFound("No encontramos ese comercio.");
}

/** Busca un comercio por nombre o variante normalizados; lo crea si no existe. */
export async function resolveMerchant(db: Tx, userId: string, name: string) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return null;
  const existing = await db.merchant.findFirst({
    where: { userId, OR: [{ normalizedName }, { aliases: { has: normalizedName } }] },
  });
  if (existing) return existing;
  return db.merchant.create({ data: { userId, name: name.trim(), normalizedName } });
}

/** La última categoría confirmada para un comercio pasa a ser su categoría habitual. */
export async function recordMerchantUsage(db: Tx, merchantId: string, categoryId: string | null): Promise<void> {
  await db.merchant.update({
    where: { id: merchantId },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
      ...(categoryId && { defaultCategoryId: categoryId }),
    },
  });
}
