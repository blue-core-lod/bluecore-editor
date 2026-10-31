import type { Hit } from './qa'

/**
 * A left-anchored heading browse, as in Connexion: catalogers trained on
 * authorized strings type the heading, and QA's keyword search can't find
 * "United States. Congress. House" among the thousands of headings that
 * contain those words. id.loc.gov's suggest2 browses headings and their 4XX
 * variants alphabetically, and allows any origin.
 */

/** Whether the text is shaped like a heading: "Twain, Mark", "United States. Congress", "Dogs--Training". */
export function isHeading(text: string): boolean {
  return /,|\.\s|--/.test(text)
}

export function browseUrl(directory: string, query: string, count = 10): string {
  const params = new URLSearchParams({ q: heading(query), searchtype: 'leftanchored', count: String(count) })
  return `https://id.loc.gov/authorities/${directory}/suggest2/?${params}`
}

/** LC writes subdivisions as "Dogs--Training", with no spaces. */
function heading(query: string): string {
  return query.trim().replace(/\s*--\s*/g, '--')
}

interface BrowseHit {
  uri?: string
  /** The authorized heading. */
  aLabel?: string
  /** The variant that matched, when it wasn't the authorized heading. */
  vLabel?: string
}

/** Headings in an id.loc.gov directory that begin with the text, in alphabetical order. */
export async function browseHeadings(directory: string, query: string, signal?: AbortSignal): Promise<Hit[]> {
  const response = await fetch(browseUrl(directory, query), { signal })
  if (!response.ok) throw new Error(`id.loc.gov returned ${response.status}`)
  const json = (await response.json()) as { hits?: BrowseHit[] }
  return (json.hits ?? []).flatMap((hit) =>
    hit.uri && hit.aLabel
      ? [{ uri: hit.uri, label: hit.aLabel, ...(hit.vLabel && hit.vLabel !== hit.aLabel ? { variant: hit.vLabel } : {}) }]
      : [],
  )
}
