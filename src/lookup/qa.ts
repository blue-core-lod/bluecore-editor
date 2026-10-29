import { config } from '../config'
import type { Source } from './sources'

export interface Hit {
  uri: string
  label: string
}

/** What QA returns: a bare list from most authorities, wrapped with a header from some. */
interface QaHit {
  uri?: string
  label?: string
}

export function searchUrl(source: Source, query: string, maxRecords = 10): string {
  const params = new URLSearchParams({ q: query, maxRecords: String(maxRecords), lang: 'en' })
  return `${config.qaUrl}authorities/search/${source.path}?${params}`
}

/** Search one source. QA needs no token, so none is sent. */
export async function searchSource(source: Source, query: string, signal?: AbortSignal): Promise<Hit[]> {
  const response = await fetch(searchUrl(source, query), { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${source.label} returned ${response.status}`)
  const json = (await response.json()) as QaHit[] | { results?: QaHit[] }
  const hits = Array.isArray(json) ? json : (json.results ?? [])
  return hits.flatMap((hit) => (hit.uri && hit.label ? [{ uri: hit.uri, label: hit.label }] : []))
}
