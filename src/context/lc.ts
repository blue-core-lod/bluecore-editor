import { lcTermOf } from './terms'

/**
 * An LC authority record, read from id.loc.gov's suggest2 service. Searched by
 * its own identifier, suggest2 returns the record's evidence as plain JSON
 * (variants, 670 citations, dates, broader terms), so the editor reads an
 * authority without reading RDF. id.loc.gov allows any origin.
 */

export interface LcAuthority {
  uri: string
  /** The authorized heading, as in the 1XX. */
  label: string
  /** The LCCN, such as "n79021164" or "sh85076502". */
  id: string
  /** The kind of authority, such as "LC name authority". */
  kind: string
  marcKey?: string
  /** 4XX variants, in latin and other scripts. */
  variants: string[]
  /** 670 citations: where the heading's evidence was found. */
  sources: Citation[]
  /** Other headings the record says to see. */
  sees: string[]
  broader: string[]
  narrower: string[]
  notes: string[]
  born?: string
  died?: string
  birthplaces: string[]
  occupations: string[]
  fields: string[]
}

export interface Citation {
  /** The work cited, such as "DAB, 1930". */
  title: string
  /** What it says, the part in parentheses. */
  found?: string
  /** A link the citation gives, for one viewed online. */
  url?: string
}

/** The authority directories the panel reads, by their path on id.loc.gov. */
const directories: Record<string, string> = {
  names: 'LC name authority',
  subjects: 'LC subject heading',
  genreForms: 'LC genre/form term',
  childrensSubjects: 'LC children’s subject heading',
}

/**
 * Where to find an LC authority, or undefined for a URI that isn't one. A
 * real-world-object URI (/rwo/agents/) names the same record, and so does a
 * place's URI as a geographic subdivision ("n79041717-781", from its 781).
 */
export function lcAuthorityId(uri: string): { directory: string; id: string; uri: string } | undefined {
  const match = /^https?:\/\/id\.loc\.gov\/(?:authorities\/(\w+)|rwo\/agents)\/([a-z]+\d+)(?:-781)?$/.exec(
    uri.replace(/\.html$/, ''),
  )
  if (!match) return undefined
  const directory = match[1] ?? 'names'
  const id = match[2] as string
  if (!(directory in directories)) return undefined
  return { directory, id, uri: `http://id.loc.gov/authorities/${directory}/${id}` }
}

/** Whether the context panel can say more about this URI: an LC authority, vocabulary term or class number. */
export function hasContext(uri: string): boolean {
  return lcAuthorityId(uri) !== undefined || lcTermOf(uri) !== undefined
}

export function suggestUrl(directory: string, id: string): string {
  const params = new URLSearchParams({ q: id, searchtype: 'keyword', count: '5' })
  return `https://id.loc.gov/authorities/${directory}/suggest2/?${params}`
}

interface SuggestHit {
  uri?: string
  aLabel?: string
  suggestLabel?: string
  token?: string
  more?: Record<string, unknown>
}

/** The record for an LC authority URI, or null if id.loc.gov doesn't have it. */
export async function fetchLcAuthority(uri: string, signal?: AbortSignal): Promise<LcAuthority | null> {
  const where = lcAuthorityId(uri)
  if (!where) return null
  const response = await fetch(suggestUrl(where.directory, where.id), { signal })
  if (!response.ok) throw new Error(`id.loc.gov returned ${response.status}`)
  const json = (await response.json()) as { hits?: SuggestHit[] }
  // A keyword search: the identifier can turn up in other records' text.
  const hit = json.hits?.find((hit) => hit.uri === where.uri || hit.token === where.id)
  return hit ? fromSuggest(hit, where.directory, where.id) : null
}

export function fromSuggest(hit: SuggestHit, directory: string, id: string): LcAuthority {
  const more = hit.more ?? {}
  const list = (key: string): string[] =>
    // suggest2 repeats some values ("Authors" once per 374 field).
    Array.isArray(more[key]) ? [...new Set((more[key] as unknown[]).filter((v): v is string => typeof v === 'string'))] : []
  return {
    uri: hit.uri ?? `http://id.loc.gov/authorities/${directory}/${id}`,
    label: hit.aLabel || hit.suggestLabel || id,
    id,
    kind: directories[directory] ?? 'LC authority',
    marcKey: marcKey(list('marcKeys')[0]),
    variants: list('variantLabels'),
    sources: list('sources').map(citation),
    sees: list('sees'),
    broader: list('broaders'),
    narrower: list('narrowers'),
    // The machine-derived script notes are about the record, not the entity.
    notes: list('notes').filter((note) => !note.startsWith('[')),
    born: list('birthdates')[0],
    died: list('deathdates')[0],
    birthplaces: list('birthplaces'),
    occupations: list('occupations'),
    fields: list('activityfields'),
  }
}

/** "found : DAB, 1930 (Clemens, …)https://…" as its parts. */
export function citation(text: string): Citation {
  let rest = text.replace(/^found\s*:\s*/, '').trim()
  const url = /(https?:\/\/\S+)$/.exec(rest)?.[1]
  if (url) rest = rest.slice(0, -url.length).trim()
  // What the source says is the parenthetical that ends the citation; one 670
  // can cite several sources, each with its own.
  const open = rest.endsWith(')') ? openingOf(rest) : -1
  if (open > 0) {
    return { title: rest.slice(0, open).trim().replace(/[:;,]$/, ''), found: rest.slice(open + 1, -1).trim(), url }
  }
  return { title: rest, url }
}

/** Where the parenthesis that closes the text opens, or -1 if it doesn't balance. */
function openingOf(text: string): number {
  let depth = 0
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ')') depth++
    if (text[i] === '(' && --depth === 0) return i
  }
  return -1
}

/** "1001 $aTwain, Mark,$d1835-1910" as a cataloger reads it: "100 1_ $aTwain, Mark,$d1835-1910". */
export function marcKey(key: string | undefined): string | undefined {
  const match = key && /^(\d{3})(.)(.)(\$.*)$/.exec(key)
  if (!match) return key
  const [, tag, first, second, rest] = match as unknown as [string, string, string, string, string]
  return `${tag} ${first.replace(' ', '_')}${second.replace(' ', '_')} ${rest}`
}
