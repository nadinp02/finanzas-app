/**
 * Texto dictado: minúsculas y sin acentos, **conservando la longitud** para que las posiciones que
 * encuentran los analizadores sirvan para recortar el texto original.
 */
export function fold(text: string): string {
  let result = "";
  for (const char of text.normalize("NFC")) {
    const lower = char.toLowerCase();
    const stripped = lower.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    // Si cambiar mayúsculas o quitar marcas altera la longitud (casos raros), se deja el original.
    result += stripped.length === char.length ? stripped : lower.length === char.length ? lower : char;
  }
  return result;
}

/** Espacios simples y sin bordes: la transcripción tal como se guarda. */
export function cleanTranscript(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Busca una frase como palabras completas (texto ya plegado). Devuelve la posición o -1. */
export function findPhrase(foldedText: string, foldedPhrase: string): number {
  const phrase = foldedPhrase.trim().replace(/\s+/g, " ");
  if (!phrase) return -1;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, "u");
  return pattern.exec(foldedText)?.index ?? -1;
}

export function containsPhrase(text: string, phrase: string): boolean {
  return findPhrase(fold(text), fold(phrase)) >= 0;
}

/** Igual que `containsPhrase` pero ignorando signos de puntuación (citas que el modelo recorta). */
export function containsLoosely(text: string, fragment: string): boolean {
  const simplify = (value: string) =>
    fold(value)
      .replace(/[^\p{L}\p{N}$]+/gu, " ")
      .trim();
  const needle = simplify(fragment);
  return needle.length > 0 && ` ${simplify(text)} `.includes(` ${needle} `);
}
