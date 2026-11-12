/**
 * Contexto de prueba para las reglas de voz: las categorías y comercios por defecto reales, con
 * identificadores deterministas. Solo lo importan las pruebas.
 */
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_MERCHANTS } from "@/modules/categories/defaults";
import { categoryRefs, type AccountRef, type CategoryRef, type MerchantRef, type VoiceContext } from "./rules";

function fakeId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export const TEST_ACCOUNTS = {
  cash: { id: fakeId(9001), name: "Efectivo", type: "CASH" },
  bank: { id: fakeId(9002), name: "Banco Galicia", type: "BANK" },
  wallet: { id: fakeId(9003), name: "Mercado Pago", type: "DIGITAL_WALLET" },
  visa: { id: fakeId(9004), name: "Visa", type: "CREDIT_CARD" },
} satisfies Record<string, AccountRef>;

function buildCategories(): CategoryRef[] {
  let counter = 0;
  const raw: { id: string; name: string; kind: "EXPENSE" | "INCOME"; parentId: string | null }[] = [];
  for (const [kind, list] of [["EXPENSE", DEFAULT_EXPENSE_CATEGORIES], ["INCOME", DEFAULT_INCOME_CATEGORIES]] as const) {
    for (const root of list) {
      const id = fakeId(++counter);
      raw.push({ id, name: root.name, kind, parentId: null });
      for (const child of root.children ?? []) raw.push({ id: fakeId(++counter), name: child.name, kind, parentId: id });
    }
  }
  return categoryRefs(raw);
}

export const TEST_CATEGORIES = buildCategories();

export function categoryIdByPath(path: string): string {
  const found = TEST_CATEGORIES.find((c) => c.path === path);
  if (!found) throw new Error(`Sin categoría ${path}`);
  return found.id;
}

export const TEST_MERCHANTS: MerchantRef[] = DEFAULT_MERCHANTS.map((merchant) => ({
  name: merchant.name,
  aliases: merchant.aliases ?? [],
  defaultCategoryId: categoryIdByPath(merchant.category),
}));

export function testContext(overrides: Partial<VoiceContext> = {}): VoiceContext {
  return {
    today: "2026-11-05",
    trackingStartDate: "2026-09-01",
    accounts: Object.values(TEST_ACCOUNTS),
    categories: TEST_CATEGORIES,
    merchants: TEST_MERCHANTS,
    defaultAccountId: TEST_ACCOUNTS.cash.id,
    ...overrides,
  };
}
