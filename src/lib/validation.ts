import { z } from "zod";
import { isLocalDate, isYearMonth } from "./dates";
import { isDecimalString, MAX_ABS_CENTS, parseDecimal } from "./money";

// Mensajes por defecto en español para los casos sin mensaje propio.
z.config(z.locales.es());

export { z };

export const idSchema = z.uuid({ error: "Identificador inválido." });

export const localDateSchema = z.string().refine(isLocalDate, { error: "Fecha inválida." });

export const yearMonthSchema = z.string().refine(isYearMonth, { error: "Mes inválido." });

const decimalSchema = z
  .string({ error: "Ingresá un importe." })
  .trim()
  .refine(isDecimalString, { error: "Importe inválido." })
  .refine((value) => {
    const cents = parseDecimal(value);
    return cents <= MAX_ABS_CENTS && cents >= -MAX_ABS_CENTS;
  }, { error: "El importe es demasiado grande." });

/** Importe con signo, cero incluido (saldos iniciales, saldo real en un ajuste). */
export const decimalSignedSchema = decimalSchema;

/** Importe > 0 como string decimal normalizado ("69500.00"). */
export const positiveAmountSchema = decimalSchema.refine((value) => parseDecimal(value) > 0n, {
  error: "Ingresá un importe mayor a cero.",
});

export const nonNegativeAmountSchema = decimalSchema.refine((value) => parseDecimal(value) >= 0n, {
  error: "El importe no puede ser negativo.",
});

export const nonZeroAmountSchema = decimalSchema.refine((value) => parseDecimal(value) !== 0n, {
  error: "El importe no puede ser cero.",
});

export const nameSchema = (max: number, label = "un nombre") =>
  z
    .string({ error: `Ingresá ${label}.` })
    .trim()
    .min(1, { error: `Ingresá ${label}.` })
    .max(max, { error: `Máximo ${max} caracteres.` });

/** Texto opcional: vacío equivale a no informado. */
export const optionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo ${max} caracteres.` })
    .transform((value) => value || undefined)
    .optional();
