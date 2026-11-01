import { lccnForVocabularyTerm } from './wikidata'

/**
 * An id.loc.gov term that isn't an authority record: a vocabulary term (a
 * language, a content type, a publication's country) or an LC Classification
 * number. id.loc.gov's suggest2 says what it is as plain JSON: its label, the
 * vocabulary it belongs to, and, for a class number, the classes above it.
 * Wikidata maps some vocabulary terms to an item (P4801), and the item to an
 * LC authority (P244), which the panel already reads in full: a country code
 * leads to the place's name authority, a language code to its subject heading.
 * No RDF is read.
 */

export interface LcTerm {
  uri: string
  label: string
  /** The code or class number, such as "nyu" or "G4282.R5". */
  code: string
  /** What kind of term it is, as a cataloger would name it. */
  kind: string
  /** For a class number, the classes above it, broadest first. */
  broader: string[]
  /** The LCCN of the LC authority for the same thing, where Wikidata knows it. */
  lccn: string | null
}

/** Names for the vocabularies catalogers meet most; any other is an "LC vocabulary term". */
const kinds: Record<string, string> = {
  countries: 'MARC country code',
  geographicAreas: 'MARC geographic area code',
  languages: 'MARC language code',
  contentTypes: 'RDA content type',
  mediaTypes: 'RDA media type',
  carriers: 'RDA carrier type',
  issuance: 'Mode of issuance',
  relators: 'Relator term',
  mrelief: 'Relief',
  classification: 'LC Classification number',
}

/** Where a term's suggest2 lives and its code, or undefined for a URI that isn't an id.loc.gov term. */
export function lcTermOf(uri: string): { directory: string; scheme: string; code: string } | undefined {
  const match = /^https?:\/\/id\.loc\.gov\/(vocabulary\/(\w+)|authorities\/(classification))\/([^/\s]+)$/.exec(
    uri.replace(/\.html$/, ''),
  )
  if (!match) return undefined
  return { directory: match[1] as string, scheme: (match[2] ?? match[3]) as string, code: match[4] as string }
}

interface SuggestHit {
  uri?: string
  aLabel?: string
  suggestLabel?: string
  more?: { broaders?: unknown }
}

export async function fetchLcTerm(uri: string, signal?: AbortSignal): Promise<LcTerm | null> {
  const where = lcTermOf(uri)
  if (!where) return null
  const params = new URLSearchParams({ q: where.code, searchtype: 'keyword', count: '10' })
  const lccn =
    where.directory === 'classification' || where.directory.startsWith('authorities/')
      ? Promise.resolve(null)
      : // Wikidata is a bonus: the term is still worth showing without it.
        lccnForVocabularyTerm(`${where.scheme}/${where.code}`, signal).catch(() => null)
  const response = await fetch(`https://id.loc.gov/${where.directory}/suggest2/?${params}`, { signal })
  if (!response.ok) throw new Error(`id.loc.gov returned ${response.status}`)
  const json = (await response.json()) as { hits?: SuggestHit[] }
  // A keyword search: the code can turn up in other terms' labels.
  const hit = json.hits?.find((hit) => hit.uri?.replace(/^https:/, 'http:') === uri.replace(/^https:/, 'http:'))
  if (!hit) return null
  const broader = Array.isArray(hit.more?.broaders) ? hit.more.broaders.filter((b): b is string => typeof b === 'string') : []
  return {
    uri,
    label: hit.aLabel || hit.suggestLabel || where.code,
    code: where.code,
    kind: kinds[where.scheme] ?? 'LC vocabulary term',
    broader,
    lccn: await lccn,
  }
}

/** The URI of the LC authority an LCCN names, by its prefix: names, subjects, genre/form terms. */
export function authorityUriFor(lccn: string): string | undefined {
  const directory = lccn.startsWith('sh')
    ? 'subjects'
    : lccn.startsWith('gf')
      ? 'genreForms'
      : lccn.startsWith('sj')
        ? 'childrensSubjects'
        : /^n[a-z]?\d/.test(lccn)
          ? 'names'
          : undefined
  return directory && `http://id.loc.gov/authorities/${directory}/${lccn}`
}
