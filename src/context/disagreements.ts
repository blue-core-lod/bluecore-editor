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
  // LC gives a pseudonym its own record (Twain apart from Clemens); a Wikidata
  // item that names several LC records holds their pen names together.
  const pseudonyms = wikidata.lcRecords > 1 ? [] : wikidata.pseudonyms
  const missing = pseudonyms.filter((name) => {
    const want = words(name)
    // Either may say more: "Sieur Louis de Conte" is LC's "Conte, Louis de, 1835-1910".
    return want.size > 0 && !known.some((heading) => within(want, heading) || within(heading, want))
  })
  if (missing.length === 1) {
    found.push(`Wikidata lists a pen name, ${missing[0]}, that the LC record doesn’t include as a variant.`)
  } else if (missing.length > 1) {
    found.push(`Wikidata lists pen names the LC record doesn’t include as variants: ${missing.join('; ')}.`)
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

function within(some: Set<string>, all: Set<string>): boolean {
  return some.size > 0 && [...some].every((word) => all.has(word))
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
