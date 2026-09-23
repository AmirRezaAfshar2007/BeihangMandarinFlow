/**
 * Shortens a dictionary-style English meaning (often a semicolon-separated
 * list of synonyms/definitions, sometimes with parenthetical notes) down to
 * a brief 2-3 word phrase for compact display.
 *
 * Example: "to love; affection; to be fond of" -> "to love"
 * Example: "you (singular, polite)"            -> "you"
 * Example: "bright; clear; next; understand"    -> "bright"
 */
export function shortenMeaning(meaning: string, maxWords: number = 3): string {
  if (!meaning) return '';

  // Strip parenthetical notes first, e.g. "(singular, polite)", so a comma
  // inside a note doesn't get mistaken for a list separator.
  const withoutParens = meaning.replace(/\([^)]*\)/g, '').trim();

  // Take only the first entry in a semicolon separated list.
  const firstEntry = (withoutParens.split(';')[0] || withoutParens).trim();

  // Cap to the first 2-3 words.
  const words = firstEntry.split(/\s+/).filter(Boolean).slice(0, maxWords);

  return words.join(' ').trim();
}
