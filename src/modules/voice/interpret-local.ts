/**
 * Intérprete local por reglas: separa la transcripción en movimientos (uno por importe dicho) y
 * completa lo que puede con el vocabulario y los datos de la usuaria. No usa servicios externos.
 *
 * Sus resultados pasan por la misma validación que los de un modelo y **siempre requieren revisión**.
 */
import { capitalizeFirst } from "@/lib/text";
import { findDateMentions } from "./dates";
import { findInstallments, type AmountMatch } from "./numbers";
import {
  detectFlowHints,
  keywordCategory,
  scanAccountMentions,
  scanMerchants,
  spokenAmounts,
  type VoiceContext,
} from "./rules";
import { VOICE_LIMITS, type InterpretedItem } from "./schema";
import { fold } from "./text";

export const LOCAL_INTERPRETER_MODEL = "local";

interface Range {
  start: number;
  end: number;
}

const SEPARATOR = /[,;.\n]|\s(?:y|e|despues|tambien|ademas|luego|aparte)\s/g;

function trimRange(text: string, range: Range): Range {
  let { start, end } = range;
  while (start < end && /[\s,;.:]/.test(text[start]!)) start += 1;
  while (end > start && /[\s,;.:]/.test(text[end - 1]!)) end -= 1;
  return { start, end };
}

/** Un tramo de texto por importe. */
export function splitByAmounts(transcript: string, amounts: AmountMatch[]): (Range & { amount: AmountMatch })[] {
  const folded = fold(transcript);
  const cuts = [...folded.matchAll(SEPARATOR)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
    .filter((cut) => !amounts.some((a) => cut.start < a.end && cut.end > a.start));

  const clauses: Range[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    clauses.push({ start: cursor, end: cut.start });
    cursor = cut.end;
  }
  clauses.push({ start: cursor, end: transcript.length });

  const pieces: (Range & { amount: AmountMatch })[] = [];
  let pendingStart: number | null = null;
  for (const clause of clauses) {
    const inClause = amounts.filter((a) => a.start >= clause.start && a.end <= clause.end);
    if (!inClause.length) {
      // Contexto sin importe ("ayer fui al súper"): se suma al tramo siguiente.
      pendingStart ??= clause.start;
      continue;
    }
    const start = pendingStart ?? clause.start;
    pendingStart = null;
    if (inClause.length === 1) {
      pieces.push({ start, end: clause.end, amount: inClause[0]! });
      continue;
    }
    // Varios importes sin separador: "nafta 50 mil super 32 mil" (lo dicho antes del importe) o
    // "50 mil de nafta 32 mil de super" (lo dicho después).
    const before = fold(transcript.slice(clause.start, inClause[0]!.start));
    const thingFirst = /\p{L}{3,}/u.test(before);
    inClause.forEach((amount, index) => {
      const next = inClause[index + 1];
      const pieceStart = index === 0 ? start : thingFirst ? inClause[index - 1]!.end : amount.start;
      const pieceEnd = next ? (thingFirst ? amount.end : next.start) : clause.end;
      pieces.push({ start: pieceStart, end: pieceEnd, amount });
    });
  }
  if (pendingStart !== null && pieces.length) pieces[pieces.length - 1]!.end = transcript.length;
  return pieces.map((piece) => ({ ...trimRange(transcript, piece), amount: piece.amount }));
}

function toAmountText(amount: AmountMatch): string {
  const integer = amount.cents / 100n;
  const fraction = (amount.cents % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

export function interpretLocally(transcript: string, ctx: VoiceContext): InterpretedItem[] {
  const amounts = spokenAmounts(transcript);
  if (!amounts.length) return [];
  const transcriptHints = detectFlowHints(transcript);
  const transcriptDates = findDateMentions(transcript, ctx.today).flatMap((m) => (m.date ? [m.date] : []));
  const sharedDate = new Set(transcriptDates).size === 1 ? transcriptDates[0]! : ctx.today;
  const categoriesById = new Map(ctx.categories.map((category) => [category.id, category]));

  return splitByAmounts(transcript, amounts)
    .slice(0, VOICE_LIMITS.maxItems)
    .map((piece) => {
      const text = transcript.slice(piece.start, piece.end);
      const hints = detectFlowHints(text);
      const type =
        hints.income && !hints.expense
          ? "INCOME"
          : !hints.income && !hints.expense && transcriptHints.income && !transcriptHints.expense
            ? "INCOME"
            : "EXPENSE";
      const ownDate = findDateMentions(text, ctx.today).find((m) => m.date)?.date;
      const merchant = scanMerchants(text, ctx.merchants)[0]?.merchant ?? null;
      const habitual = merchant?.defaultCategoryId ? categoriesById.get(merchant.defaultCategoryId) : undefined;
      const keyword = keywordCategory(text, type, ctx.categories);
      const category = habitual && habitual.kind === type ? habitual : (keyword?.category ?? null);
      const account = scanAccountMentions(text, ctx.accounts)[0];
      const installments = findInstallments(text)[0] ?? null;
      return {
        type,
        amount: toAmountText(piece.amount),
        date: ownDate ?? sharedDate,
        description: merchant ? null : keyword ? capitalizeFirst(keyword.word) : null,
        merchant: merchant?.name ?? null,
        category: category?.path ?? null,
        accountMention: account?.text ?? null,
        installments,
        quote: text,
        confidence: 0.5,
      } satisfies InterpretedItem;
    });
}
