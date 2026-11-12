/**
 * Fechas dichas en español: "hoy", "ayer", "anteayer", "el lunes", "hace 3 días", "el 15",
 * "15 de octubre", "3/11". Se resuelven contra "hoy" en la zona horaria de la usuaria.
 *
 * Una expresión que no alcanza para fijar un día ("la semana pasada") se devuelve sin fecha: obliga a
 * revisar en lugar de suponer.
 */
import { addDays, daysInMonth, dayOfMonth, dayOfWeek, isLocalDate, monthOf, yearOf, type LocalDate } from "@/lib/dates";
import { fold } from "./text";

export interface DateMention {
  date: LocalDate | null;
  start: number;
  end: number;
  text: string;
}

const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12,
};
const SMALL: Record<string, number> = {
  un: 1, una: 1, uno: 1, primero: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30,
};

const DAY_WORD = `(\\d{1,2}|${Object.keys(SMALL).join("|")}|treinta y uno)`;
const MONTH_WORD = `(${Object.keys(MONTHS).join("|")})`;

function dayNumber(word: string): number | null {
  if (/^\d{1,2}$/.test(word)) return Number(word);
  if (word === "treinta y uno") return 31;
  return SMALL[word] ?? null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Día del mes indicado; si cae después de hoy, el del mes (o año) anterior. */
function resolveDay(today: LocalDate, day: number, month?: number, year?: number): LocalDate | null {
  if (day < 1 || day > 31) return null;
  if (month !== undefined) {
    let y = year ?? yearOf(today);
    if (y < 100) y += 2000;
    let candidate = `${y}-${pad(month)}`;
    if (day > daysInMonth(candidate)) return null;
    let date = `${candidate}-${pad(day)}`;
    if (year === undefined && date > today) {
      candidate = `${y - 1}-${pad(month)}`;
      if (day > daysInMonth(candidate)) return null;
      date = `${candidate}-${pad(day)}`;
    }
    return isLocalDate(date) ? date : null;
  }
  let candidateMonth = monthOf(today);
  if (day > dayOfMonth(today)) {
    const [y, m] = candidateMonth.split("-").map(Number) as [number, number];
    candidateMonth = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  }
  if (day > daysInMonth(candidateMonth)) return null;
  return `${candidateMonth}-${pad(day)}`;
}

interface Rule {
  pattern: RegExp;
  resolve: (match: RegExpExecArray, today: LocalDate) => LocalDate | null;
}

const RULES: Rule[] = [
  { pattern: /\b(?:antes de ayer|anteayer|antier|antes de anoche)\b/g, resolve: (_m, today) => addDays(today, -2) },
  { pattern: /\b(?:ayer|anoche)\b/g, resolve: (_m, today) => addDays(today, -1) },
  { pattern: /\b(?:hoy|esta manana|esta tarde|esta noche|recien|hace un rato)\b/g, resolve: (_m, today) => today },
  {
    pattern: new RegExp(`\\bhace (\\d{1,2}|${Object.keys(SMALL).join("|")}) (dias?|semanas?)\\b`, "g"),
    resolve: (m, today) => {
      const count = dayNumber(m[1]!);
      if (count === null) return null;
      return addDays(today, -count * (m[2]!.startsWith("semana") ? 7 : 1));
    },
  },
  {
    pattern: new RegExp(`\\b(?:el |este |del )?(?:dia )?${DAY_WORD} de ${MONTH_WORD}(?: (?:de|del) (\\d{2,4}))?\\b`, "g"),
    resolve: (m, today) => {
      const day = dayNumber(m[1]!);
      return day === null ? null : resolveDay(today, day, MONTHS[m[2]!], m[3] ? Number(m[3]) : undefined);
    },
  },
  {
    pattern: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g,
    resolve: (m, today) => {
      const month = Number(m[2]);
      if (month < 1 || month > 12) return null;
      return resolveDay(today, Number(m[1]), month, m[3] ? Number(m[3]) : undefined);
    },
  },
  {
    pattern: /\b(?:el |este |el pasado )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: pasado)?\b/g,
    resolve: (m, today) => {
      // El último día con ese nombre antes de hoy (uno a siete días atrás).
      const target = WEEKDAYS[m[1]!]!;
      const back = (dayOfWeek(today) - target + 7) % 7 || 7;
      return addDays(today, -back);
    },
  },
  {
    pattern: new RegExp(`\\b(?:el|del) (?:dia )?${DAY_WORD}\\b(?! (?:mil|lucas|millones|millon|pesos|cuotas?|dias?))`, "g"),
    resolve: (m, today) => {
      const day = dayNumber(m[1]!);
      return day === null ? null : resolveDay(today, day);
    },
  },
  // Expresiones que no alcanzan para fijar el día: se piden.
  {
    pattern: /\b(?:la semana pasada|el mes pasado|el otro dia|el finde|el fin de semana|hace unos dias|hace un tiempo|la otra semana)\b/g,
    resolve: () => null,
  },
];

export function findDateMentions(text: string, today: LocalDate): DateMention[] {
  const folded = fold(text);
  const mentions: DateMention[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of folded.matchAll(rule.pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      // La primera regla que cubre un tramo gana ("anteayer" antes que "ayer", "15 de octubre" antes que "el 15").
      if (mentions.some((m) => start < m.end && end > m.start)) continue;
      mentions.push({ date: rule.resolve(match as RegExpExecArray, today), start, end, text: text.slice(start, end) });
    }
  }
  return mentions.sort((a, b) => a.start - b.start);
}
