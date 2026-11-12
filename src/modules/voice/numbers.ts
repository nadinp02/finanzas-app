/**
 * Importes dichos en español rioplatense: "sesenta y nueve mil quinientos", "50 mil", "$ 32.000",
 * "1,5 millones", "50 lucas", "un palo", "mil doscientos con cincuenta". Trabaja en centavos `bigint`.
 *
 * También sirve para validar al modelo: un importe que el modelo devuelve tiene que estar entre los
 * que este analizador encuentra en la transcripción.
 */
import type { Cents } from "@/lib/money";
import { fold } from "./text";

export interface AmountMatch {
  cents: Cents;
  /** Posición en el texto (sirve también sobre el texto original: `fold` conserva la longitud). */
  start: number;
  end: number;
}

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const TEENS: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};
const THOUSAND_WORDS = new Set(["mil", "luca", "lucas", "lucardas", "k"]);
const MILLION_WORDS = new Set(["millon", "millones", "palo", "palos"]);

/** Palabras que, justo después de un número, indican que no es un importe. */
const NOT_AMOUNT_AFTER = new Set([
  "cuota", "cuotas", "pagos", "dia", "dias", "semana", "semanas", "mes", "meses", "ano", "anos", "hora", "horas",
  "minuto", "minutos", "litro", "litros", "kilometro", "kilometros", "km", "veces", "vez", "personas", "unidades",
]);
const MONTHS = new Set([
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre",
  "noviembre", "diciembre",
]);
const CURRENCY_WORDS = new Set(["pesos", "peso", "mangos"]);

/** Palabras que, justo antes de un número, indican fecha u hora ("el 15", "a las 8"). */
const NOT_AMOUNT_BEFORE = new Set(["el", "dia", "las", "los", "hace", "x"]);

interface Token {
  text: string;
  start: number;
  end: number;
  kind: "digits" | "word" | "symbol";
}

function tokenize(folded: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\d+(?:[.,]\d+)*|[a-zñ]+|[$/]/g;
  for (const match of folded.matchAll(pattern)) {
    const text = match[0];
    const kind = /^\d/.test(text) ? "digits" : /^[a-zñ]/.test(text) ? "word" : "symbol";
    tokens.push({ text, start: match.index, end: match.index + text.length, kind });
  }
  return tokens;
}

/** "50.000" → 5000000n, "1,5" → 150n, "1.234,56" → 123456n. Null si el formato es ambiguo. */
export function parseDigits(text: string): Cents | null {
  let integer: string;
  let fraction = "";
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) {
    [integer, fraction = ""] = text.split(",") as [string, string?];
    integer = integer.replace(/\./g, "");
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) {
    [integer, fraction = ""] = text.split(".") as [string, string?];
    integer = integer.replace(/,/g, "");
  } else if (/^\d+[.,]\d{1,2}$/.test(text)) {
    [integer, fraction] = text.split(/[.,]/) as [string, string];
  } else if (/^\d+$/.test(text)) {
    integer = text;
  } else {
    return null;
  }
  if (integer.length > 12) return null;
  return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
}

function wordValue(word: string): { value: number; rank: number } | null {
  if (word in UNITS) return { value: UNITS[word]!, rank: 1 };
  if (word in TEENS) return { value: TEENS[word]!, rank: 2 };
  if (word in TENS) return { value: TENS[word]!, rank: 2 };
  if (word in HUNDREDS) return { value: HUNDREDS[word]!, rank: 3 };
  return null;
}

interface ParsedNumber {
  cents: Cents;
  /** Índice del último token consumido. */
  last: number;
  /** Solo "un"/"una"/"uno" sueltos: es un artículo, no un importe. */
  articleOnly: boolean;
  /** Número chico dicho solo con palabras y sin multiplicador ("dos", "veinte"): suele ser una cantidad. */
  smallWordsOnly: boolean;
}

/** Después de "con": centavos ("mil doscientos con cincuenta"), solo si no sigue un sustantivo. */
const CENTS_FOLLOWERS = new Set(["centavos", "y", "en", "de", "del", "pesos", "con", "que", "para", "por"]);

function parseCentsAfterCon(tokens: Token[], j: number, folded: string): { value: number; last: number } | null {
  const next = tokens[j + 1];
  if (!next) return null;
  let value: number | undefined;
  let last = j + 1;
  if (next.kind === "digits" && /^\d{1,2}$/.test(next.text)) value = Number(next.text);
  else {
    const word = wordValue(next.text);
    if (word && word.rank < 3) {
      value = word.value;
      const unit = tokens[j + 3];
      if (next.text in TENS && tokens[j + 2]?.text === "y" && unit && wordValue(unit.text)?.rank === 1) {
        value += wordValue(unit.text)!.value;
        last = j + 3;
      }
    }
  }
  if (value === undefined || value <= 0 || value >= 100) return null;
  const follower = tokens[last + 1];
  const separated = follower ? /[^\s]/.test(folded.slice(tokens[last]!.end, follower.start)) : true;
  if (follower && !separated && !CENTS_FOLLOWERS.has(follower.text)) return null;
  if (follower?.text === "centavos") last += 1;
  return { value, last };
}

/** Lee un número que empieza en el token `i` (dígitos, palabras o combinación). */
function parseNumberAt(tokens: Token[], i: number, folded: string): ParsedNumber | null {
  let total = 0n;
  let current = 0n;
  let rank = 4; // rango del último sumando del grupo actual: deben ser decrecientes (cien > diez > uno)
  let any = false;
  let last = i - 1;
  let lastKind: "digits" | "word" | "multiplier" | "none" = "none";
  let lastTensWord = false;
  let lastMultiplier = 0n;
  let articleOnly = true;
  let usedDigitsOrMultiplier = false;

  for (let j = i; j < tokens.length; j++) {
    const token = tokens[j]!;
    const gap = folded.slice(tokens[j - 1]?.end ?? token.start, token.start);
    // Signos entre tokens (coma, punto) cortan el número: "nafta 50 mil, super 32 mil".
    if (j > i && /[^\s]/.test(gap)) break;

    if (token.kind === "digits") {
      if (lastKind === "digits") {
        // "50 000": separador de miles con espacio.
        const previous = tokens[j - 1]!.text;
        if (/^\d{1,3}$/.test(previous) && /^\d{3}$/.test(token.text) && current < 100_000n) {
          current = current * 1000n + BigInt(token.text) * 100n;
          last = j;
          continue;
        }
        break;
      }
      if (lastKind === "word") break;
      const value = parseDigits(token.text);
      if (value === null) break;
      current += value;
      any = true;
      articleOnly = false;
      usedDigitsOrMultiplier = true;
      lastKind = "digits";
      last = j;
      // "50k" (pegado): multiplicador.
      continue;
    }

    if (token.kind !== "word") {
      if (token.text === "$" && !any) {
        last = j;
        continue;
      }
      break;
    }

    const word = token.text;
    const small = wordValue(word);
    if (small) {
      if (lastKind === "digits") break;
      // Los sumandos de un grupo van de mayor a menor rango: "ciento cincuenta y cinco", no "cinco cinco".
      if (rank !== 4 && small.rank >= rank) break;
      current += BigInt(small.value) * 100n;
      rank = small.rank;
      lastTensWord = word in TENS;
      any = true;
      if (!(word === "un" || word === "una" || word === "uno")) articleOnly = false;
      lastKind = "word";
      last = j;
      continue;
    }

    if (word === "y") {
      const next = tokens[j + 1];
      if (lastTensWord && next && wordValue(next.text)?.rank === 1) {
        lastTensWord = false;
        continue;
      }
      // "un millón y medio", "mil y medio".
      if (lastKind === "multiplier" && next?.text === "medio") {
        total += lastMultiplier / 2n;
        last = j + 1;
        j += 1;
        continue;
      }
      break;
    }

    if (word === "medio" && !any) {
      const next = tokens[j + 1];
      if (next && (MILLION_WORDS.has(next.text) || next.text === "mil")) {
        current = 50n; // 0,5 en centavos de unidad: se multiplica a continuación
        any = true;
        articleOnly = false;
        lastKind = "word";
        last = j;
        continue;
      }
      break;
    }

    if (THOUSAND_WORDS.has(word) || MILLION_WORDS.has(word)) {
      if (!any && word !== "mil") break;
      // "k" solo vale pegado a dígitos ("50k").
      if (word === "k" && !(lastKind === "digits" && token.start === tokens[j - 1]!.end)) break;
      const multiplier = THOUSAND_WORDS.has(word) ? 1000n : 1_000_000n;
      const base = current === 0n ? 100n : current;
      if (multiplier === 1_000_000n) {
        total = (total + base) * multiplier;
      } else {
        total += base * multiplier;
      }
      lastMultiplier = multiplier * 100n;
      usedDigitsOrMultiplier = true;
      current = 0n;
      rank = 4;
      lastTensWord = false;
      any = true;
      articleOnly = false;
      lastKind = "multiplier";
      last = j;
      continue;
    }

    if (word === "con" && any) {
      const centsPart = parseCentsAfterCon(tokens, j, folded);
      if (centsPart) {
        current += BigInt(centsPart.value);
        last = centsPart.last;
      }
      break;
    }

    break;
  }

  if (!any) return null;
  const cents = total + current;
  return { cents, last, articleOnly, smallWordsOnly: !usedDigitsOrMultiplier && cents < 10_000n };
}

/** Todos los importes que aparecen en el texto, en orden. */
export function findAmounts(text: string): AmountMatch[] {
  const folded = fold(text);
  const tokens = tokenize(folded);
  const matches: AmountMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    const startsNumber = token.kind === "digits" || token.text === "$" || wordValue(token.text) !== null || token.text === "mil" || token.text === "medio";
    if (!startsNumber) {
      i += 1;
      continue;
    }
    const parsed = parseNumberAt(tokens, i, folded);
    if (!parsed || parsed.last < i) {
      i += 1;
      continue;
    }
    const first = tokens[i]!.text === "$" ? tokens[i + 1] : tokens[i];
    const lastToken = tokens[parsed.last]!;
    const previous = tokens[i - 1];
    const next = tokens[parsed.last + 1];
    const nextAfter = tokens[parsed.last + 2];
    const touchesSlash =
      (previous?.text === "/" && previous.end === first?.start) || (next?.text === "/" && next.start === lastToken.end);
    const isDate =
      touchesSlash ||
      (next?.text === "de" && nextAfter !== undefined && MONTHS.has(nextAfter.text)) ||
      (next !== undefined && MONTHS.has(next.text));
    const notAmount =
      parsed.articleOnly ||
      (parsed.smallWordsOnly && tokens[i]!.text !== "$" && !(next && CURRENCY_WORDS.has(next.text))) ||
      parsed.cents === 0n ||
      isDate ||
      (next !== undefined && next.text !== "de" && NOT_AMOUNT_AFTER.has(next.text)) ||
      (previous !== undefined && NOT_AMOUNT_BEFORE.has(previous.text) && tokens[i]!.text !== "$" && !/mil|millon|palo|luca/.test(folded.slice(first?.start ?? 0, lastToken.end)));
    if (!notAmount) {
      matches.push({ cents: parsed.cents, start: tokens[i]!.start, end: lastToken.end });
    }
    i = parsed.last + 1;
  }
  return matches;
}

export function amountsIn(text: string): Cents[] {
  return findAmounts(text).map((match) => match.cents);
}

/** "en 3 cuotas", "tres cuotas", "6 pagos" → cantidad de cuotas mencionadas en el texto. */
export function findInstallments(text: string): number[] {
  const folded = fold(text);
  const tokens = tokenize(folded);
  const found: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.text !== "cuota" && token.text !== "cuotas" && token.text !== "pagos") continue;
    const previous = tokens[i - 1];
    if (!previous) continue;
    let count: number | null = null;
    if (previous.kind === "digits" && /^\d{1,2}$/.test(previous.text)) count = Number(previous.text);
    else {
      const value = wordValue(previous.text);
      if (value) {
        count = value.value;
        // "veinticuatro", "treinta y seis"
        const tens = tokens[i - 3];
        if (tokens[i - 2]?.text === "y" && tens && tens.text in TENS) count += TENS[tens.text]!;
      }
    }
    if (count !== null && count >= 2 && count <= 72) found.push(count);
  }
  return found;
}
