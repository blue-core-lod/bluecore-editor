import { config } from '../config'
import { browseHeadings, isHeading } from './browse'
import { searchVocabulary } from './local'
import { isBrowse, isLocal, type QaSource, type Source } from './sources'

export interface Hit {
  uri: string
  label: string
  /** The MARC code, for a term from an LC vocabulary. */
  code?: string
  /** The 4XX variant a heading browse matched, when it wasn't the authorized heading. */
  variant?: string
  /** The MADS class, such as "mads:Geographic", where the source says. */
  type?: string
  /** The authority's MARC key, such as "181  $zCalifornia", where the source gives it. */
  marcKey?: string
}

/** What QA returns: a bare list from most authorities, wrapped with a header from some. */
interface QaHit {
  uri?: string
  label?: string
}

export function searchUrl(source: QaSource, query: string, maxRecords = 10): string {
  const params = new URLSearchParams({ q: query, maxRecords: String(maxRecords), lang: 'en' })
  return `${config.qaUrl}authorities/search/${source.path}?${params}`
}

/** Whether this search browses the source's headings rather than searching by keyword. */
export function browses(source: Source, query: string): boolean {
  return isBrowse(source) || (!isLocal(source) && source.browse !== undefined && isHeading(query))
}

/**
 * Search one source: a vendored vocabulary, a heading browse for text shaped
 * like a heading, or QA. None needs a token, so none is sent.
 */
export async function searchSource(source: Source, query: string, signal?: AbortSignal): Promise<Hit[]> {
  if (isLocal(source)) return searchVocabulary(source.vocabulary, query)
  if (isBrowse(source)) return browseHeadings(source.browse, query, signal, source.memberOf)
  if (source.browse && isHeading(query)) return browseHeadings(source.browse, query, signal)
  const response = await fetch(searchUrl(source, query), { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${source.label} returned ${response.status}`)
  const json = (await response.json()) as QaHit[] | { results?: QaHit[] }
  const hits = Array.isArray(json) ? json : (json.results ?? [])
  return hits.flatMap((hit) => (hit.uri && hit.label ? [{ uri: hit.uri, label: hit.label }] : []))
}
