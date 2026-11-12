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
    // `prisma generate` no necesita conexión; migrate/db sí y fallan con un error claro. Las migraciones
    // usan la conexión directa si existe (Neon en Vercel la publica como DATABASE_URL_UNPOOLED): el
    // pooler en modo transacción no admite los bloqueos que toma `migrate deploy`.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
