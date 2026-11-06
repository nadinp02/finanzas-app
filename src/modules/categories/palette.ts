/**
 * Paleta sobria para categorías: misma luminosidad y croma moderado, para que ningún color grite.
 * Las claves se guardan en la base; los valores pueden ajustarse sin migrar datos.
 */
export const CATEGORY_COLORS = {
  stone: "oklch(0.55 0.02 70)",
  slate: "oklch(0.52 0.03 255)",
  sage: "oklch(0.55 0.07 150)",
  moss: "oklch(0.52 0.08 128)",
  olive: "oklch(0.56 0.08 105)",
  teal: "oklch(0.54 0.07 195)",
  ocean: "oklch(0.52 0.09 240)",
  indigo: "oklch(0.5 0.1 275)",
  plum: "oklch(0.5 0.09 320)",
  rose: "oklch(0.55 0.1 10)",
  clay: "oklch(0.57 0.1 45)",
  amber: "oklch(0.64 0.11 75)",
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const CATEGORY_COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColor[];

export function categoryColor(key: string): string {
  return CATEGORY_COLORS[key as CategoryColor] ?? CATEGORY_COLORS.stone;
}
