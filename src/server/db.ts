import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
  return new PrismaClient({ adapter, log: ["error"] });
}

function client(): PrismaClient {
  // En desarrollo el hot reload reevalúa módulos: se reutiliza una sola instancia del pool.
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Cliente Prisma creado en el primer uso. Importarlo no abre conexiones ni lee variables de entorno,
 * así el build y las pruebas pueden cargar módulos de servidor sin una base disponible.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/** Cliente dentro de `prisma.$transaction(async (tx) => …)`. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Las escrituras de varias filas comparten esta transacción con nivel de aislamiento explícito. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { isolationLevel: "ReadCommitted", timeout: 15_000 });
}
