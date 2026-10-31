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

/** A browse limited to one of LC's collections, such as its geographic subdivisions, when memberOf names it. */
export function browseUrl(directory: string, query: string, memberOf?: string, count = 10): string {
  const params = new URLSearchParams({ q: heading(query), searchtype: 'leftanchored', count: String(count) })
  if (memberOf) params.set('memberOf', memberOf)
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
  more?: { rdftypes?: string[]; marcKeys?: string[] }
}

/** What isn't the kind of authority: "Topic" and "Geographic" are, "SimpleType" and "Authority" aren't. */
const notKinds = new Set(['SimpleType', 'ComplexType', 'Authority', 'DeprecatedAuthority', 'Name', 'Variant'])

/** The MADS class of a hit, such as "mads:Geographic", from the types suggest2 lists. */
export function madsType(rdftypes: readonly string[] | undefined): string | undefined {
  const kind = rdftypes?.find((type) => !notKinds.has(type))
  return kind && `mads:${kind}`
}

/** Headings in an id.loc.gov directory that begin with the text, in alphabetical order. */
export async function browseHeadings(
  directory: string,
  query: string,
  signal?: AbortSignal,
  memberOf?: string,
): Promise<Hit[]> {
  const response = await fetch(browseUrl(directory, query, memberOf), { signal })
  if (!response.ok) throw new Error(`id.loc.gov returned ${response.status}`)
  const json = (await response.json()) as { hits?: BrowseHit[] }
  return (json.hits ?? []).flatMap((hit) => {
    if (!hit.uri || !hit.aLabel) return []
    const type = madsType(hit.more?.rdftypes)
    const marcKey = hit.more?.marcKeys?.[0]
    return [
      {
        uri: hit.uri,
        label: hit.aLabel,
        ...(hit.vLabel && hit.vLabel !== hit.aLabel ? { variant: hit.vLabel } : {}),
        ...(type ? { type } : {}),
        ...(marcKey ? { marcKey } : {}),
      },
    ]
  })
}
