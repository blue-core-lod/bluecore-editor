/**
 * A heading as NACO compares headings: case, diacritics, punctuation and
 * spacing don't count, so "United States Congress. Senate." is LC's "United
 * States. Congress. Senate", and "Jews -- Germany" is "Jews--Germany". MARC
 * data converted to BIBFRAME keeps the punctuation its fields ended with,
 * and catalogers type headings in more than one way.
 */
export function normalizeHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function sameHeading(a: string, b: string): boolean {
  const normalized = normalizeHeading(a)
  return normalized !== '' && normalized === normalizeHeading(b)
}
