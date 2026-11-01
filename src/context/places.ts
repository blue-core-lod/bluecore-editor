import { lccnForVocabularyTerm } from './wikidata'

/**
 * A place given by a MARC code rather than an authority: a publication's
 * country ("nyu", from the 008) or a geographic area ("n-us-ny", from the
 * 043). id.loc.gov says little about the code itself, but Wikidata maps the
 * code to the place's item (P4801), and the item to its LC name authority
 * (P244), which the panel already reads in full. So a code opens the same
 * context as the place's name would, without reading RDF.
 */

export interface PlaceCode {
  /** The vocabulary term's URI. */
  uri: string
  code: string
  /** What the code is, as a cataloger would name it. */
  kind: string
  /** The LC name authority for the same place, where Wikidata knows it. */
  lccn: string | null
}

const vocabularies: Record<string, string> = {
  countries: 'MARC country code',
  geographicAreas: 'MARC geographic area code',
}

/** The vocabulary and code a place-code URI names, or undefined for any other URI. */
export function placeCodeOf(uri: string): { vocabulary: string; code: string } | undefined {
  const match = /^https?:\/\/id\.loc\.gov\/vocabulary\/(\w+)\/([a-z0-9-]+)$/.exec(uri.replace(/\.html$/, ''))
  if (!match || !((match[1] as string) in vocabularies)) return undefined
  return { vocabulary: match[1] as string, code: match[2] as string }
}

export async function fetchPlaceCode(uri: string, signal?: AbortSignal): Promise<PlaceCode | null> {
  const where = placeCodeOf(uri)
  if (!where) return null
  const lccn = await lccnForVocabularyTerm(`${where.vocabulary}/${where.code}`, signal)
  return { uri, code: where.code, kind: vocabularies[where.vocabulary] as string, lccn }
}

/** The name authority's URI for an LCCN, which the panel reads like any other. */
export function nameAuthorityUri(lccn: string): string {
  return `http://id.loc.gov/authorities/names/${lccn}`
}
