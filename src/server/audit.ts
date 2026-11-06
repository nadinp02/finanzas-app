import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "./db";

export interface AuditEntry {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Registra en la misma transacción que la escritura auditada cuando se pasa `tx`. */
export async function audit(entry: AuditEntry, tx: Tx = prisma): Promise<void> {
  await tx.auditLog.create({ data: entry });
}
