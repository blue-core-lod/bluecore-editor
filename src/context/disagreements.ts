import type { LcAuthority } from './lc'
import type { WikidataFacts } from './wikidata'

/**
 * Where Wikidata and the LC record disagree. Shown quietly: either could be
 * right, and each is a lead for maintenance (design.md, The context panel).
 */
export function disagreements(lc: LcAuthority, wikidata: WikidataFacts): string[] {
  const found: string[] = []
  const born = differs(lc.born, wikidata.born)
  if (born) found.push(`Wikidata gives the birth date as ${wikidata.born}; the LC record has ${lc.born}.`)
  const died = differs(lc.died, wikidata.died)
  if (died) found.push(`Wikidata gives the death date as ${wikidata.died}; the LC record has ${lc.died}.`)
  const known = [lc.label, ...lc.variants, ...lc.sees].map(words)
  for (const name of wikidata.pseudonyms) {
    const want = words(name)
    if (want.size === 0 || known.some((heading) => [...want].every((word) => heading.has(word)))) continue
    found.push(`Wikidata lists a pen name, ${name}, that the LC record doesn’t include as a variant.`)
  }
  return found
}

/**
 * Two dates disagree where both give a part and the parts differ: "1835"
 * agrees with "1835-11-30", which only says more.
 */
function differs(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const length = Math.min(a.length, b.length)
  return a.slice(0, length) !== b.slice(0, length)
}

/** A name's words, ignoring order, case, accents and punctuation, so "Conte, Louis de" matches "Louis de Conte". */
function words(name: string): Set<string> {
  const plain = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\d{3,4}-?(\d{3,4})?/g, ' ')
  return new Set(plain.split(/[^\p{L}]+/u).filter((word) => word.length > 0))
}
