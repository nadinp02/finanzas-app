/**
 * Dinero exacto. Los importes se operan como centavos `bigint`, viajan como string decimal
 * ("69500.00") y se guardan como NUMERIC(14,2). Nunca se usa `number` para importes.
 */

export type Cents = bigint;

/** 999.999.999.999,99: el máximo que admite NUMERIC(14,2). */
export const MAX_ABS_CENTS: Cents = 99_999_999_999_999n;

const DECIMAL_PATTERN = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

/** "69500.5" → 6950050n. Lanza si el formato no es un decimal con hasta 2 decimales. */
export function parseDecimal(value: string): Cents {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new RangeError(`Importe inválido: "${value}"`);
  }
  const [, sign, integer, fraction = ""] = match;
  const cents = BigInt(integer!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign ? -cents : cents;
}

/** Desde Prisma.Decimal (NUMERIC) o un string decimal, sin pasar por number. */
export function centsOf(value: { toFixed(digits: number): string } | string): Cents {
  return parseDecimal(typeof value === "string" ? value : value.toFixed(2));
}

/** 6950050n → "69500.50" */
export function toDecimal(cents: Cents): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const integer = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

/**
 * Interpreta lo que una persona escribe en Argentina: "69.500", "69500", "69.500,50", "$ 1.234",
 * "69,5". La coma es decimal; el punto es separador de miles, salvo que sea el único separador y le
 * sigan 1 o 2 dígitos ("69.5" se lee como 69,5). Devuelve null si no es un importe.
 */
export function parseAmountInput(input: string): Cents | null {
  let text = input.replace(/\$|\s| /g, "");
  if (!text) return null;
  let negative = false;
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = true;
    text = text.slice(1);
  }
  let integer: string;
  let fraction = "";
  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length !== 2) return null;
    [integer, fraction] = parts as [string, string];
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(integer)) return null;
    integer = integer.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    [integer, fraction] = text.split(".") as [string, string];
  } else if (/^\d{1,3}(\.\d{3})+$|^\d+$/.test(text)) {
    integer = text.replace(/\./g, "");
  } else {
    return null;
  }
  if (!/^\d+$/.test(integer) || !/^\d{0,2}$/.test(fraction)) return null;
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (cents > MAX_ABS_CENTS) return null;
  return negative ? -cents : cents;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export interface FormatMoneyOptions {
  /** "auto": muestra centavos solo si los hay ($ 69.500 / $ 69.500,50). */
  decimals?: "auto" | "always" | "never";
  /** "always" antepone + a los positivos (ingresos). */
  sign?: "auto" | "always" | "never";
  symbol?: boolean;
}

/** Formato argentino: "$ 69.500", "$ 69.500,50", "−$ 1.200". */
export function formatMoney(cents: Cents, options: FormatMoneyOptions = {}): string {
  const { decimals = "auto", sign = "auto", symbol = true } = options;
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  let integer = abs / 100n;
  let fraction = abs % 100n;
  if (decimals === "never" && fraction !== 0n) {
    integer += fraction >= 50n ? 1n : 0n;
    fraction = 0n;
  }
  let text = groupThousands(integer.toString());
  if (decimals === "always" || (decimals === "auto" && fraction !== 0n)) {
    text += `,${fraction.toString().padStart(2, "0")}`;
  }
  if (symbol) text = `$ ${text}`;
  if (sign !== "never") {
    if (negative && abs !== 0n) text = `−${text}`;
    else if (sign === "always" && abs !== 0n) text = `+${text}`;
  }
  return text;
}

/** Para ejes y etiquetas chicas: "$ 69,5 mil", "$ 1,2 M". */
export function formatMoneyCompact(cents: Cents): string {
  const negative = cents < 0n;
  const pesos = Number(negative ? -cents : cents) / 100;
  let text: string;
  if (pesos >= 1_000_000) text = `${trimDecimal(pesos / 1_000_000)} M`;
  else if (pesos >= 1_000) text = `${trimDecimal(pesos / 1_000)} mil`;
  else text = trimDecimal(pesos);
  return `${negative ? "−" : ""}$ ${text}`;
}

function trimDecimal(value: number): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toString().replace(".", ",");
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

export function absCents(value: Cents): Cents {
  return value < 0n ? -value : value;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a > b ? a : b;
}

export function minCents(a: Cents, b: Cents): Cents {
  return a < b ? a : b;
}

/** value · numerator / denominator con redondeo mitad hacia arriba (en valor absoluto). */
export function mulDiv(value: Cents, numerator: bigint, denominator: bigint): Cents {
  if (denominator === 0n) throw new RangeError("División por cero");
  const product = value * numerator;
  const negative = product < 0n !== denominator < 0n;
  const absProduct = product < 0n ? -product : product;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absProduct * 2n + absDenominator) / (absDenominator * 2n);
  return negative ? -rounded : rounded;
}

/**
 * Divide un total en `parts` cuotas. El resto de centavos va a la primera cuota, así la suma es
 * exactamente el total: 100.000 en 3 → 33.333,34 + 33.333,33 + 33.333,33.
 */
export function splitInstallments(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("Cantidad de cuotas inválida");
  if (total <= 0n) throw new RangeError("El total debe ser positivo");
  const count = BigInt(parts);
  const base = total / count;
  const remainder = total - base * count;
  return Array.from({ length: parts }, (_, index) => (index === 0 ? base + remainder : base));
}

/** Variación porcentual; null si el valor anterior es cero (no hay base de comparación). */
export function percentChange(current: Cents, previous: Cents): number | null {
  if (previous === 0n) return null;
  return (Number(current - previous) / Number(absCents(previous))) * 100;
}

/** Proporción para barras de progreso, acotada a [0, 1]. */
export function progressRatio(part: Cents, whole: Cents): number {
  if (whole <= 0n || part <= 0n) return 0;
  if (part >= whole) return 1;
  return Number((part * 10_000n) / whole) / 10_000;
}
