import { prisma, transaction } from "@/server/db";
import { seedUserDefaults } from "@/modules/onboarding/seed";

let counter = 0;

/**
 * Usuaria con categorías y comercios por defecto. Usa un hash ficticio para no pagar el costo de
 * scrypt en cada prueba (las pruebas de autenticación usan el alta real).
 */
export async function createTestUser(overrides: { trackingStartDate?: string } = {}) {
  counter += 1;
  return transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: `test${counter}-${Date.now()}@example.com`,
        name: "Prueba",
        passwordHash: "scrypt$0$0$0$x$x",
        trackingStartDate: new Date(`${overrides.trackingStartDate ?? "2026-01-01"}T00:00:00Z`),
        onboardedAt: new Date(),
      },
    });
    await seedUserDefaults(tx, user.id);
    return user;
  });
}

export async function categoryId(userId: string, name: string): Promise<string> {
  const category = await prisma.category.findFirstOrThrow({ where: { userId, name } });
  return category.id;
}
