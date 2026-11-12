-- Reintentos de una carga por voz: `attempts` funciona como token de versión para que dos solicitudes
-- simultáneas no reprocesen la misma carga, y `started_at` marca el inicio del intento en curso
-- (una carga en PROCESSING con más de 2 minutos se considera abandonada y se puede retomar).
ALTER TABLE "voice_entries" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "voice_entries" ADD COLUMN "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "voice_entries" ADD CONSTRAINT "voice_entries_attempts_check" CHECK ("attempts" >= 1);
