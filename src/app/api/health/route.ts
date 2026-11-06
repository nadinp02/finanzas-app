import { connection } from "next/server";
import { prisma } from "@/server/db";

/** Chequeo de salud para el hosting: no expone datos ni requiere sesión. */
export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
