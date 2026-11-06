import { defineConfig } from "prisma/config";

// Prisma 7 no carga .env automáticamente. En Vercel/CI las variables ya vienen
// del entorno, por eso la ausencia del archivo no es un error.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` no necesita conexión; migrate/db sí y fallan con un error claro.
    url: process.env.DATABASE_URL ?? "",
  },
});
