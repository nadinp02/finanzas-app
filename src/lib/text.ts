/** Minúsculas, sin acentos ni signos, espacios simples: "  Farmacíty  S.A." → "farmacity s a". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+&]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Primera letra en mayúscula, respetando el resto. */
export function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
