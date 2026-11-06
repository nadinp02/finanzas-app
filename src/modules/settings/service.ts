import "server-only";
import { fromDbDate } from "@/lib/dates";
import { errors } from "@/lib/errors";
import { prisma } from "@/server/db";
import type { AccountType } from "@/generated/prisma/enums";
import { isCard } from "@/modules/accounts/rules";
import { listCategories } from "@/modules/categories/service";
import type { CategoryDTO } from "@/modules/categories/schema";
import { listMerchants } from "@/modules/merchants/service";
import type { MerchantDTO } from "@/modules/merchants/schema";
import type { UpdateSettingsInput } from "./schema";

export async function updateSettings(userId: string, input: UpdateSettingsInput): Promise<void> {
  if (input.defaultAccountId) {
    const account = await prisma.account.findFirst({ where: { id: input.defaultAccountId, userId, isActive: true } });
    if (!account) throw errors.validation({ defaultAccountId: "Elegí una cuenta activa." });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { name: input.name, defaultAccountId: input.defaultAccountId, voiceAutoSave: input.voiceAutoSave },
  });
}

export interface BootstrapData {
  user: {
    name: string;
    timezone: string;
    trackingStartDate: string | null;
    defaultAccountId: string | null;
    voiceAutoSave: boolean;
  };
  accounts: { id: string; name: string; type: AccountType; isActive: boolean; openingDate: string }[];
  categories: CategoryDTO[];
  merchants: MerchantDTO[];
}

/** Datos de referencia para formularios: se guardan en IndexedDB para cargar sin conexión. */
export async function getBootstrap(userId: string): Promise<BootstrapData> {
  const [user, accounts, categories, merchants] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, timezone: true, trackingStartDate: true, defaultAccountId: true, voiceAutoSave: true },
    }),
    prisma.account.findMany({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true, isActive: true, openingDate: true },
    }),
    listCategories(userId),
    listMerchants(userId),
  ]);
  return {
    user: { ...user, trackingStartDate: user.trackingStartDate ? fromDbDate(user.trackingStartDate) : null },
    // Activas primero y, dentro de cada grupo, cuentas antes que tarjetas (el orden es estable).
    accounts: accounts
      .toSorted((a, b) => Number(b.isActive) - Number(a.isActive) || Number(isCard(a.type)) - Number(isCard(b.type)))
      .map((account) => ({ ...account, openingDate: fromDbDate(account.openingDate) })),
    categories,
    merchants,
  };
}
