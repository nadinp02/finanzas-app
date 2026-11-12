/**
 * Validación determinística de lo interpretado (BUSINESS_RULES §12.2). No se confía en el intérprete:
 * cada importe, fecha, comercio, cuenta y cantidad de cuotas tiene que poder rastrearse hasta la
 * transcripción. Lo que no se dijo no se guarda; lo dudoso se marca para revisar.
 *
 * Puro: sin React, Next ni Prisma.
 */
import type { AccountType } from "@/generated/prisma/enums";
import { addDays, formatShortDate, isLocalDate, type LocalDate } from "@/lib/dates";
import { formatMoney, isDecimalString, parseAmountInput, parseDecimal, toDecimal, type Cents } from "@/lib/money";
import { capitalizeFirst, normalizeText } from "@/lib/text";
import { findDateMentions, type DateMention } from "./dates";
import {
  CATEGORY_KEYWORDS,
  COMMON_WORD_MERCHANTS,
  EXPENSE_PHRASES,
  GENERIC_ACCOUNT_WORDS,
  INCOME_PHRASES,
  MERCHANT_CUES,
  NON_MOVEMENT_CUES,
  PAYMENT_PHRASES,
  UNSUPPORTED_PHRASES,
} from "./lexicon";
import { findAmounts, findInstallments, type AmountMatch } from "./numbers";
import { VOICE_LIMITS, type InterpretedItem, type VoiceDraft, type VoiceIssue } from "./schema";
import { fold } from "./text";

// ── Datos de referencia ────────────────────────────────────────────────────────────────────────

export interface AccountRef {
  id: string;
  name: string;
  type: AccountType;
}

export interface CategoryRef {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  parentId: string | null;
  /** "Transporte › Combustible" o "Supermercado". */
  path: string;
}

export interface MerchantRef {
  name: string;
  aliases: string[];
  defaultCategoryId: string | null;
}

export interface VoiceContext {
  today: LocalDate;
  trackingStartDate: LocalDate | null;
  /** Solo cuentas activas. */
  accounts: AccountRef[];
  categories: CategoryRef[];
  merchants: MerchantRef[];
  defaultAccountId: string | null;
}

/** Máximo por movimiento dictado (BUSINESS_RULES §12.2): $ 100.000.000. */
export const MAX_VOICE_AMOUNT: Cents = 10_000_000_000n;

export function categoryRefs(categories: { id: string; name: string; kind: "EXPENSE" | "INCOME"; parentId: string | null }[]): CategoryRef[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return categories.map((category) => {
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    return { ...category, path: parent ? `${parent.name} › ${category.name}` : category.name };
  });
}

// ── Búsqueda de frases ─────────────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(phrase: string): RegExp {
  const words = phrase.trim().split(/\s+/).map(escapeRegExp).join("[\\s,.]+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${words}(?![\\p{L}\\p{N}])`, "gu");
}

/** Todas las apariciones de las frases (texto plegado), las más largas primero y sin solaparse. */
function scanPhrases<T>(folded: string, entries: { phrase: string; value: T }[]): (Span & { phrase: string; value: T })[] {
  const hits: (Span & { phrase: string; value: T })[] = [];
  const sorted = entries.filter((e) => e.phrase.trim()).toSorted((a, b) => b.phrase.length - a.phrase.length);
  for (const entry of sorted) {
    for (const match of folded.matchAll(phrasePattern(entry.phrase))) {
      const start = match.index;
      const end = start + match[0].length;
      if (hits.some((hit) => start < hit.end && end > hit.start)) continue;
      hits.push({ start, end, phrase: entry.phrase, value: entry.value });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && a.end > b.start;
}

function inside(inner: Span, outer: Span): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/**
 * Ubica una cita del intérprete en la transcripción, tolerando mayúsculas, acentos y puntuación.
 * Devuelve el tramo en la transcripción o null si la cita no sale de ahí.
 */
export function locateQuote(transcript: string, quote: string): Span | null {
  const words = fold(quote)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return null;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escapeRegExp).join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`, "u");
  const match = pattern.exec(fold(transcript));
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

// ── Tipo de movimiento ─────────────────────────────────────────────────────────────────────────

export interface FlowHints {
  income: boolean;
  expense: boolean;
}

/** Verbos y palabras de ingreso o gasto ("me cobraron" es gasto aunque contenga "cobr"). */
export function detectFlowHints(text: string): FlowHints {
  const hits = scanPhrases(fold(text), [
    ...EXPENSE_PHRASES.map((phrase) => ({ phrase, value: "expense" as const })),
    ...INCOME_PHRASES.map((phrase) => ({ phrase, value: "income" as const })),
  ]);
  return { income: hits.some((h) => h.value === "income"), expense: hits.some((h) => h.value === "expense") };
}

// ── Cuentas ────────────────────────────────────────────────────────────────────────────────────

export interface AccountMention extends Span {
  /** Lo que se dijo ("con la visa"). */
  text: string;
  /** Cuentas que corresponden a esa mención. */
  candidates: string[];
  /** Por nombre propio de una cuenta (gana sobre las menciones genéricas). */
  named: boolean;
}

function accountPhrases(account: AccountRef): string[] {
  const full = normalizeText(account.name);
  const words = full.split(" ").filter((word) => word.length >= 3 && !GENERIC_ACCOUNT_WORDS.has(word));
  return [full, ...words];
}

/** Menciones de cuentas o medios de pago en un texto. */
export function scanAccountMentions(text: string, accounts: AccountRef[]): AccountMention[] {
  const folded = fold(text);
  const named = scanPhrases(
    folded,
    accounts.flatMap((account) => accountPhrases(account).map((phrase) => ({ phrase, value: account.id }))),
  );
  const mentions: AccountMention[] = [];
  for (const hit of named) {
    const existing = mentions.find((m) => overlaps(m, hit));
    if (existing) {
      if (!existing.candidates.includes(hit.value)) existing.candidates.push(hit.value);
      continue;
    }
    // Una palabra puede identificar a varias cuentas ("visa" en "Visa Galicia" y "Visa BBVA").
    const sameWord = named.filter((other) => other.start === hit.start && other.end === hit.end).map((other) => other.value);
    const candidates = [...new Set([hit.value, ...sameWord])];
    for (const account of accounts) {
      if (!candidates.includes(account.id) && accountPhrases(account).includes(hit.phrase)) candidates.push(account.id);
    }
    mentions.push({ start: hit.start, end: hit.end, text: text.slice(hit.start, hit.end), candidates, named: true });
  }
  const generic = scanPhrases(
    folded,
    PAYMENT_PHRASES.flatMap((entry) => entry.phrases.map((phrase) => ({ phrase, value: entry.types }))),
  );
  for (const hit of generic) {
    if (mentions.some((m) => overlaps(m, hit))) continue;
    const candidates = accounts.filter((account) => hit.value.includes(account.type)).map((account) => account.id);
    mentions.push({ start: hit.start, end: hit.end, text: text.slice(hit.start, hit.end), candidates, named: false });
  }
  return mentions.sort((a, b) => a.start - b.start);
}

export type AccountResolution =
  | { status: "none" }
  | { status: "matched"; accountId: string; mention: string }
  | { status: "ambiguous"; candidates: string[]; mention: string }
  | { status: "not_found"; mention: string };

/** Decide la cuenta a partir de las menciones: las de nombre propio ganan sobre las genéricas. */
export function resolveAccount(mentions: AccountMention[]): AccountResolution {
  if (!mentions.length) return { status: "none" };
  const relevant = mentions.some((m) => m.named) ? mentions.filter((m) => m.named) : mentions;
  const candidates = [...new Set(relevant.flatMap((m) => m.candidates))];
  const mention = relevant.map((m) => m.text).join(", ");
  if (candidates.length === 1) return { status: "matched", accountId: candidates[0]!, mention };
  if (candidates.length > 1) {
    // "con la tarjeta Visa": la genérica y la nombrada coinciden en una sola.
    const intersection = candidates.filter((id) => relevant.every((m) => m.candidates.includes(id)));
    if (intersection.length === 1) return { status: "matched", accountId: intersection[0]!, mention };
    return { status: "ambiguous", candidates, mention };
  }
  return { status: "not_found", mention };
}

// ── Comercios y categorías ─────────────────────────────────────────────────────────────────────

export interface MerchantMention extends Span {
  merchant: MerchantRef;
}

export function scanMerchants(text: string, merchants: MerchantRef[]): MerchantMention[] {
  const folded = fold(text);
  const hits = scanPhrases(
    folded,
    merchants.flatMap((merchant) =>
      [merchant.name, ...merchant.aliases].map((name) => ({ phrase: normalizeText(name), value: merchant })),
    ),
  );
  const cue = new RegExp(`(?:^|[\\s,])(?:${MERCHANT_CUES.map(escapeRegExp).join("|")})\\s+$`);
  return hits
    .filter((hit) => !COMMON_WORD_MERCHANTS.has(hit.phrase) || cue.test(folded.slice(Math.max(0, hit.start - 12), hit.start)))
    .map((hit) => ({ start: hit.start, end: hit.end, merchant: hit.value }));
}

function sameName(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

export function findCategoryByLabel(label: string, categories: CategoryRef[]): CategoryRef | null {
  const wanted = normalizeText(label);
  return (
    categories.find((c) => normalizeText(c.path) === wanted) ??
    categories.find((c) => normalizeText(c.name) === wanted) ??
    null
  );
}

/** Categoría por palabra clave ("nafta" → Combustible). Devuelve también la palabra encontrada. */
export function keywordCategory(
  text: string,
  kind: "EXPENSE" | "INCOME",
  categories: CategoryRef[],
): { category: CategoryRef; word: string } | null {
  const folded = fold(text);
  const hits = scanPhrases(
    folded,
    CATEGORY_KEYWORDS.filter((entry) => entry.kind === kind).flatMap((entry) => entry.words.map((phrase) => ({ phrase, value: entry }))),
  );
  for (const hit of hits) {
    for (const name of hit.value.categories) {
      const category = categories.find((c) => c.kind === kind && sameName(c.name, name));
      if (category) return { category, word: hit.phrase };
    }
  }
  return null;
}

function isCategoryWord(value: string, categories: CategoryRef[]): boolean {
  const normalized = normalizeText(value);
  return (
    categories.some((c) => normalizeText(c.name) === normalized) ||
    CATEGORY_KEYWORDS.some((entry) => entry.words.includes(normalized))
  );
}

// ── Importes ───────────────────────────────────────────────────────────────────────────────────

/** Importe devuelto por el intérprete: "69500.00", "69500", "69.500", "$ 69.500,50". */
export function parseModelAmount(raw: string): Cents | null {
  const text = raw.replace(/[$\s]/g, "");
  if (isDecimalString(text)) return parseDecimal(text);
  return parseAmountInput(text);
}

/** Importes que no son movimientos ("me quedan 20 mil", "tengo un presupuesto de 100 mil"). */
function isNonMovementAmount(folded: string, match: AmountMatch): boolean {
  const before = folded.slice(Math.max(0, match.start - 30), match.start);
  return NON_MOVEMENT_CUES.some((cue) => phrasePattern(cue).test(before));
}

/** Importes dichos que representan movimientos posibles. */
export function spokenAmounts(transcript: string): AmountMatch[] {
  const folded = fold(transcript);
  return findAmounts(transcript).filter((match) => !isNonMovementAmount(folded, match));
}

// ── Validación ─────────────────────────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** Intérprete local por reglas: siempre requiere revisión. */
  local: boolean;
  newKey: () => string;
}

export interface ValidationResult {
  drafts: VoiceDraft[];
  /** Avisos de toda la carga (importes sin cargar, movimientos no soportados). */
  notices: string[];
}

function issue(field: VoiceIssue["field"], code: string, message: string): VoiceIssue {
  return { field, code, message };
}

function accountAccepts(account: AccountRef, type: "EXPENSE" | "INCOME"): boolean {
  return type === "EXPENSE" || account.type !== "CREDIT_CARD";
}

export function validateInterpretation(
  transcript: string,
  items: InterpretedItem[],
  ctx: VoiceContext,
  options: ValidateOptions,
): ValidationResult {
  const folded = fold(transcript);
  const today = ctx.today;
  const spoken = spokenAmounts(transcript);
  const spokenCount = new Map<Cents, number>();
  for (const match of spoken) spokenCount.set(match.cents, (spokenCount.get(match.cents) ?? 0) + 1);
  const usedCount = new Map<Cents, number>();
  const usedAmounts: Cents[] = [];

  const dateMentions = findDateMentions(transcript, today);
  const resolvedDates = new Set(dateMentions.flatMap((m) => (m.date ? [m.date] : [])));
  const transcriptHints = detectFlowHints(transcript);
  const accountsById = new Map(ctx.accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(ctx.categories.map((category) => [category.id, category]));

  const located = items.map((item) => locateQuote(transcript, item.quote));
  const allAccountMentions = scanAccountMentions(transcript, ctx.accounts);
  // Una cuenta mencionada fuera de toda cita ("pagué todo con la visa: ...") puede valer para varios.
  const globalAccountMentions = allAccountMentions.filter((m) => !located.some((span) => span && overlaps(span, m)));

  const drafts = items.map((item, index): VoiceDraft => {
    const issues: VoiceIssue[] = [];
    const notes: string[] = [];
    const span = located[index] ?? null;
    let scope: string | null;
    if (span) scope = transcript.slice(span.start, span.end);
    else if (items.length === 1) scope = transcript;
    else {
      scope = null;
      issues.push(issue("confidence", "QUOTE_NOT_FOUND", "No pudimos ubicar este movimiento en lo que dijiste: revisalo."));
    }
    const scopeSpan: Span = span ?? { start: 0, end: transcript.length };
    const text = scope ?? transcript;

    // Importe: tiene que haberse dicho.
    let amount: string | null = null;
    const parsed = parseModelAmount(item.amount);
    if (parsed === null || parsed <= 0n) {
      issues.push(issue("amount", "INVALID", "No entendimos el importe: ingresalo."));
    } else if (parsed > MAX_VOICE_AMOUNT) {
      issues.push(issue("amount", "TOO_LARGE", "El importe supera el máximo de $ 100.000.000."));
    } else if (!spokenCount.has(parsed)) {
      issues.push(issue("amount", "NOT_SAID", `No escuchamos ${formatMoney(parsed)} en lo que dijiste: ingresá el importe.`));
    } else {
      const uses = (usedCount.get(parsed) ?? 0) + 1;
      usedCount.set(parsed, uses);
      usedAmounts.push(parsed);
      amount = toDecimal(parsed);
      if (uses > spokenCount.get(parsed)!) {
        issues.push(issue("amount", "REPEATED", `${formatMoney(parsed)} se dijo una sola vez: revisá que el movimiento no esté repetido.`));
      } else if (scope && !findAmounts(scope).some((m) => m.cents === parsed)) {
        issues.push(issue("amount", "OUT_OF_QUOTE", "Revisá el importe: no coincide con lo que dijiste para este movimiento."));
      }
    }

    // Fecha: si no es hoy, tiene que haberse dicho.
    let date: LocalDate = today;
    const singleResolved = resolvedDates.size === 1 ? [...resolvedDates][0]! : null;
    if (!isLocalDate(item.date)) {
      date = singleResolved ?? today;
      issues.push(issue("date", "INVALID", "Revisá la fecha."));
    } else if (item.date > today) {
      date = today;
      issues.push(issue("date", "FUTURE", "La fecha no puede ser futura: revisala."));
    } else if (item.date !== today && !resolvedDates.has(item.date)) {
      date = singleResolved ?? today;
      issues.push(issue("date", "NOT_SAID", "No mencionaste esa fecha: revisala."));
    } else {
      date = item.date;
      if (date === today && resolvedDates.size > 0 && !resolvedDates.has(today)) {
        issues.push(issue("date", "OTHER_DATE", "Mencionaste otra fecha: revisá a qué día corresponde."));
      }
    }
    if (date < addDays(today, -VOICE_LIMITS.maxDaysBack)) {
      issues.push(issue("date", "TOO_OLD", "Por voz se cargan movimientos de hasta 60 días atrás."));
    }
    if (ctx.trackingStartDate && date < ctx.trackingStartDate) {
      issues.push(issue("date", "BEFORE_START", `El registro empieza el ${formatShortDate(ctx.trackingStartDate)}.`));
    }
    const vague = dateMentions.filter((m: DateMention) => m.date === null && (scope === null || inside(m, scopeSpan) || items.length === 1));
    for (const mention of vague) {
      issues.push(issue("date", "VAGUE", `Dijiste «${mention.text}»: elegí el día exacto.`));
    }
    if (dateMentions.length === 0 && date === today) notes.push("No dijiste la fecha: queda hoy.");

    // Tipo: coherente con lo dicho.
    const own = detectFlowHints(text);
    const hints = own.income || own.expense ? own : transcriptHints.income !== transcriptHints.expense ? transcriptHints : own;
    if (item.type === "INCOME") {
      if (!hints.income) issues.push(issue("type", "UNCLEAR_INCOME", "Confirmá que es un ingreso."));
      else if (hints.expense) issues.push(issue("type", "CONFLICT", "No queda claro si es ingreso o gasto."));
    } else if (hints.income && !hints.expense) {
      issues.push(issue("type", "LOOKS_INCOME", "Lo que dijiste parece un ingreso: confirmá el tipo."));
    }

    // Comercio: solo si se dijo.
    const detectedMerchants = scanMerchants(text, ctx.merchants);
    let merchant: MerchantRef | null = null;
    let merchantName: string | null = null;
    let description = item.description?.trim() || null;
    if (item.merchant) {
      const known = detectedMerchants.find((d) => [d.merchant.name, ...d.merchant.aliases].some((name) => sameName(name, item.merchant!)));
      if (known) {
        merchant = known.merchant;
        merchantName = known.merchant.name;
      } else if (locateQuote(text, item.merchant)) {
        if (isCategoryWord(item.merchant, ctx.categories)) {
          // "Supermercado" no es un comercio: queda como descripción.
          description ??= capitalizeFirst(item.merchant);
        } else {
          merchantName = item.merchant;
          merchant = ctx.merchants.find((m) => sameName(m.name, item.merchant!)) ?? null;
        }
      } else {
        notes.push(`Quitamos «${item.merchant}»: no lo mencionaste.`);
      }
    } else if (detectedMerchants.length === 1) {
      merchant = detectedMerchants[0]!.merchant;
      merchantName = merchant.name;
    }

    // Categoría: la sugerida si es válida; si no, la habitual del comercio; si no, por palabra clave.
    let categoryId: string | null = null;
    const suggested = item.category ? findCategoryByLabel(item.category, ctx.categories) : null;
    if (suggested && suggested.kind === item.type) {
      categoryId = suggested.id;
    } else {
      const habitual = merchant?.defaultCategoryId ? categoriesById.get(merchant.defaultCategoryId) : undefined;
      if (habitual && habitual.kind === item.type) {
        categoryId = habitual.id;
        notes.push(`Categoría habitual de ${merchant!.name}: ${habitual.path}.`);
      } else {
        const keyword = keywordCategory(text, item.type, ctx.categories);
        if (keyword) categoryId = keyword.category.id;
      }
    }
    if (!categoryId) issues.push(issue("category", "MISSING", "Elegí una categoría."));

    // Cuenta: la mencionada; si no se mencionó, la habitual. Nunca se inventa.
    let resolution = resolveAccount(scope ? scanAccountMentions(scope, ctx.accounts) : []);
    if (resolution.status === "none" && item.accountMention) {
      if (locateQuote(transcript, item.accountMention)) {
        const fromModel = resolveAccount(scanAccountMentions(item.accountMention, ctx.accounts));
        resolution = fromModel.status === "none" ? { status: "not_found", mention: item.accountMention } : fromModel;
      } else {
        notes.push(`Quitamos «${item.accountMention}»: no lo mencionaste.`);
      }
    }
    let accountId: string | null = null;
    let fromGlobal = false;
    if (resolution.status === "none" && globalAccountMentions.length) {
      resolution = resolveAccount(globalAccountMentions);
      fromGlobal = true;
    }
    switch (resolution.status) {
      case "matched": {
        const account = accountsById.get(resolution.accountId)!;
        if (!accountAccepts(account, item.type)) {
          issues.push(issue("account", "INCOME_TO_CARD", "Un ingreso no se acredita en una tarjeta: elegí la cuenta."));
        } else {
          accountId = account.id;
          if (fromGlobal) {
            issues.push(issue("account", "SHARED_MENTION", `Mencionaste «${resolution.mention}»: confirmá que corresponde a este movimiento.`));
          }
        }
        break;
      }
      case "ambiguous":
        issues.push(issue("account", "AMBIGUOUS", `Dijiste «${resolution.mention}»: elegí cuál.`));
        break;
      case "not_found":
        issues.push(issue("account", "NOT_FOUND", `No encontramos «${resolution.mention}» entre tus cuentas: elegí una.`));
        break;
      case "none": {
        const habitual = ctx.defaultAccountId ? accountsById.get(ctx.defaultAccountId) : undefined;
        if (habitual && accountAccepts(habitual, item.type)) {
          accountId = habitual.id;
          notes.push(
            item.type === "INCOME"
              ? `No dijiste dónde se acreditó: queda ${habitual.name}, tu cuenta habitual.`
              : `No dijiste con qué pagaste: queda ${habitual.name}, tu cuenta habitual.`,
          );
        } else {
          issues.push(issue("account", "MISSING", item.type === "INCOME" ? "Elegí dónde se acreditó." : "Elegí con qué pagaste."));
        }
      }
    }

    // Cuotas: solo si se dijeron, y solo con tarjeta.
    const saidInstallments = scope ? findInstallments(scope) : [];
    let installments: number | null = null;
    if (item.installments && item.installments > 1) {
      if (saidInstallments.includes(item.installments)) installments = item.installments;
      else issues.push(issue("installments", "NOT_SAID", "No mencionaste esas cuotas: revisalas."));
    } else if (saidInstallments.length === 1) {
      installments = saidInstallments[0]!;
    }
    if (installments) {
      const account = accountId ? accountsById.get(accountId) : undefined;
      if (item.type !== "EXPENSE") {
        installments = null;
      } else if (account && account.type !== "CREDIT_CARD") {
        issues.push(issue("installments", "NEEDS_CARD", "Las cuotas son solo para compras con tarjeta de crédito: elegí la tarjeta."));
      }
    }

    // Confianza.
    let confidence = item.confidence;
    if (options.local) {
      confidence = Math.min(confidence, 0.5);
      issues.push(issue("confidence", "LOCAL", "Interpretación automática básica: revisá los datos antes de guardar."));
    } else if (confidence < VOICE_LIMITS.minConfidence) {
      issues.push(issue("confidence", "LOW", "La interpretación no es segura: revisá los datos."));
    }

    return {
      key: options.newKey(),
      type: item.type,
      amount,
      date,
      description: description?.slice(0, 140) ?? null,
      merchantName,
      categoryId,
      accountId,
      installments,
      quote: scope && span ? scope.trim() : null,
      confidence,
      issues,
      notes,
      similar: null,
    };
  });

  // Avisos de la carga completa.
  const notices: string[] = [];
  const remaining = [...usedAmounts];
  for (const match of spoken) {
    const index = remaining.indexOf(match.cents);
    if (index >= 0) remaining.splice(index, 1);
    else notices.push(`Mencionaste ${formatMoney(match.cents)} y no se cargó como movimiento.`);
  }
  const unsupported = scanPhrases(folded, UNSUPPORTED_PHRASES.map((phrase) => ({ phrase, value: true })));
  if (unsupported.length) {
    notices.push("Los pagos de tarjeta y las transferencias entre tus cuentas se cargan desde «Nuevo movimiento».");
  }
  if (items.length >= VOICE_LIMITS.maxItems) {
    notices.push(`Se cargan hasta ${VOICE_LIMITS.maxItems} movimientos por vez: revisá si falta alguno.`);
  }
  return { drafts, notices };
}

/** Se guarda sin revisión solo si nada quedó en duda. */
export function canAutoSave(drafts: VoiceDraft[], notices: string[]): boolean {
  return (
    drafts.length > 0 &&
    notices.length === 0 &&
    drafts.every((draft) => draft.issues.length === 0 && draft.amount && draft.accountId && draft.categoryId)
  );
}
