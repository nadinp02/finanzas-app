import { afterAll, beforeEach, inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");

const { prisma } = await import("@/server/db");

beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map(({ tablename }) => `"${tablename}"`).join(", ")} CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
