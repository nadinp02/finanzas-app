/**
 * Contrato de la carga por voz (ver docs/VOICE.md). Lo comparten servidor, cliente y proveedores.
 */
import type { VoiceEntryStatus, VoiceInputType } from "@/generated/prisma/enums";
import type { LocalDate } from "@/lib/dates";
import { idSchema, localDateSchema, optionalTextSchema, positiveAmountSchema, z } from "@/lib/validation";
import { MAX_INSTALLMENTS, type TransactionDTO } from "@/modules/transactions/schema";

// ── Límites ────────────────────────────────────────────────────────────────────────────────────

export const VOICE_LIMITS = {
  /** Corte automático de la grabación. */
  maxDurationMs: 60_000,
  /** Margen para el reloj del cliente. */
  maxDeclaredDurationMs: 65_000,
  minDurationMs: 400,
  maxAudioBytes: 3 * 1024 * 1024,
  maxTextLength: 500,
  maxTranscriptLength: 2000,
  maxItems: 10,
  /** Fechas aceptadas por voz: hasta 60 días atrás (BUSINESS_RULES §12.2). */
  maxDaysBack: 60,
  minConfidence: 0.8,
  /** Una carga en PROCESSING con más tiempo que esto se considera abandonada y se puede retomar. */
  staleProcessingMs: 2 * 60_000,
} as const;

/** Formatos que graba MediaRecorder (Chrome/Android: webm; Safari/iOS: mp4) y que acepta la transcripción. */
export const AUDIO_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/m4a"] as const;

export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]!.trim().toLowerCase();
}

export function isSupportedAudioType(mimeType: string): boolean {
  return (AUDIO_MIME_TYPES as readonly string[]).includes(baseMimeType(mimeType));
}

/**
 * Quién pasa la voz a texto: "server" (OpenAI, con `OPENAI_API_KEY`) o "browser" (el reconocimiento
 * de voz del navegador, gratis; el texto se envía a `POST /api/voice/text`).
 */
export type VoiceTranscriptionMode = "server" | "browser";

// ── Entrada ────────────────────────────────────────────────────────────────────────────────────

/** Metadatos del multipart de `POST /api/voice` (el archivo se valida aparte: tamaño y tipo). */
export const voiceAudioFieldsSchema = z.object({
  clientRequestId: idSchema,
  durationMs: z.coerce
    .number({ error: "Duración inválida." })
    .int()
    .min(0)
    .max(VOICE_LIMITS.maxDeclaredDurationMs, { error: "La grabación puede durar hasta 60 segundos." }),
});

/** `POST /api/voice/text`: la frase escrita en lugar de dictada. */
export const voiceTextSchema = z.object({
  clientRequestId: idSchema,
  text: z
    .string({ error: "Escribí qué gastaste o cobraste." })
    .trim()
    .min(2, { error: "Escribí qué gastaste o cobraste." })
    .max(VOICE_LIMITS.maxTextLength, { error: `Máximo ${VOICE_LIMITS.maxTextLength} caracteres.` }),
});

export type VoiceTextInput = z.infer<typeof voiceTextSchema>;

// ── Salida del intérprete (lo que devuelve cualquier proveedor) ────────────────────────────────

/**
 * Un movimiento tal como lo entiende el intérprete, **antes** de validarlo. Nada de esto se guarda
 * sin pasar por la validación determinística (`rules.ts`).
 */
export const interpretedItemSchema = z
  .object({
    type: z.enum(["EXPENSE", "INCOME"]),
    /** Importe como texto decimal ("69500.00"); se verifica contra los importes dichos. */
    amount: z.string().trim().min(1).max(40),
    /** Fecha ISO; se verifica contra las expresiones de fecha dichas. */
    date: z.string().trim().max(10),
    description: z.string().trim().max(140).nullable(),
    /** Comercio tal como se dijo; se descarta si no aparece en la transcripción. */
    merchant: z.string().trim().max(80).nullable(),
    /** Ruta de categoría de la lista enviada ("Transporte › Combustible") o null. */
    category: z.string().trim().max(120).nullable(),
    /** Mención literal de cuenta o medio de pago ("con la visa") o null si no se dijo. */
    accountMention: z.string().trim().max(80).nullable(),
    installments: z.number().int().min(1).max(MAX_INSTALLMENTS).nullable(),
    /** Fragmento exacto de la transcripción del que sale este movimiento. */
    quote: z.string().trim().max(VOICE_LIMITS.maxTranscriptLength),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const interpretationSchema = z.object({
  items: z.array(interpretedItemSchema).max(VOICE_LIMITS.maxItems),
});

export type InterpretedItem = z.infer<typeof interpretedItemSchema>;
export type Interpretation = z.infer<typeof interpretationSchema>;

// ── Borradores validados ───────────────────────────────────────────────────────────────────────

export const VOICE_ISSUE_FIELDS = [
  "type", "amount", "date", "category", "account", "merchant", "installments", "confidence", "duplicate",
] as const;

export type VoiceIssueField = (typeof VOICE_ISSUE_FIELDS)[number];

const issueSchema = z.object({
  field: z.enum(VOICE_ISSUE_FIELDS),
  code: z.string().max(60),
  message: z.string().max(300),
});

const draftSchema = z.object({
  /** UUID del borrador: al confirmar es el `clientId` del movimiento (idempotencia). */
  key: idSchema,
  type: z.enum(["EXPENSE", "INCOME"]),
  amount: z.string().nullable(),
  date: localDateSchema,
  description: z.string().nullable(),
  merchantName: z.string().nullable(),
  categoryId: z.string().nullable(),
  accountId: z.string().nullable(),
  installments: z.number().int().nullable(),
  quote: z.string().nullable(),
  confidence: z.number(),
  /** Dudas que impiden guardar sin revisión. */
  issues: z.array(issueSchema),
  /** Aclaraciones que no bloquean ("Usamos tu cuenta habitual"). */
  notes: z.array(z.string()),
  /** Movimiento ya registrado parecido (posible duplicado). */
  similar: z
    .object({ id: z.string(), description: z.string(), amount: z.string(), date: z.string() })
    .nullable(),
});

export type VoiceIssue = z.infer<typeof issueSchema>;
export type VoiceDraft = z.infer<typeof draftSchema>;

/** Lo que se guarda en `voice_entries.items` (JSON). Se valida al leer. */
export const storedVoiceItemsSchema = z.object({
  drafts: z.array(draftSchema),
  notices: z.array(z.string()),
  /** El intérprete principal falló y se usó el local. */
  fallback: z.boolean(),
  /** Se guardó sin revisión (guardado automático). */
  autoSaved: z.boolean().default(false),
});

export type StoredVoiceItems = z.infer<typeof storedVoiceItemsSchema>;

// ── Confirmación ───────────────────────────────────────────────────────────────────────────────

/** `POST /api/voice/:id/confirm`: los borradores revisados. Los que no se envían se descartan. */
export const confirmVoiceSchema = z.object({
  items: z
    .array(
      z.object({
        key: idSchema,
        type: z.enum(["EXPENSE", "INCOME"]),
        amount: positiveAmountSchema,
        date: localDateSchema,
        accountId: z.uuid({ error: "Elegí una cuenta." }),
        categoryId: z.uuid({ error: "Elegí una categoría." }),
        merchantName: optionalTextSchema(80),
        description: optionalTextSchema(140),
        installments: z.number().int().min(2).max(MAX_INSTALLMENTS).optional(),
      }),
    )
    .min(1, { error: "No hay movimientos para guardar." })
    .max(VOICE_LIMITS.maxItems),
});

export type ConfirmVoiceInput = z.infer<typeof confirmVoiceSchema>;

// ── Respuesta ──────────────────────────────────────────────────────────────────────────────────

export const VOICE_ERROR_MESSAGES: Record<string, string> = {
  NO_MOVEMENTS: "No encontramos ningún gasto ni ingreso en lo que dijiste.",
  EMPTY_TRANSCRIPT: "No se escuchó nada. Probá de nuevo más cerca del micrófono.",
  STT_FAILED: "No pudimos transcribir el audio. Probá de nuevo o escribilo.",
  STT_NOT_CONFIGURED: "La transcripción de audio no está configurada. Podés escribir el movimiento.",
  INTERNAL_ERROR: "Ocurrió un error al procesar. Probá de nuevo.",
};

export interface VoiceEntryDTO {
  id: string;
  clientRequestId: string;
  inputType: VoiceInputType;
  status: VoiceEntryStatus;
  transcript: string | null;
  drafts: VoiceDraft[];
  notices: string[];
  /** Quién interpretó: "claude-opus-5-5", "local", etc. `fallback`: el principal falló. */
  interpreter: { model: string; local: boolean; fallback: boolean } | null;
  error: { code: string; message: string } | null;
  /** Movimientos creados (estado SAVED). */
  transactions: TransactionDTO[];
  /** Se puede deshacer mientras no se haya editado ninguno de los movimientos creados. */
  canUndo: boolean;
  /** Se guardó solo, sin revisión (guardado automático). */
  autoSaved: boolean;
  createdAt: string;
  processedAt: string | null;
  resolvedAt: string | null;
}

/** Pendiente de revisión, para el aviso en el inicio. */
export interface PendingVoiceEntry {
  id: string;
  transcript: string | null;
  count: number;
  createdAt: string;
  date: LocalDate;
}
