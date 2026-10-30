/**
 * Wikidata's facts about an entity LC also has, found by the LC authorities
 * ID (P244), which Wikidata records for LC names and subjects alike. Both the
 * query service and the API allow any origin.
 */

export interface WikidataFacts {
  /** The item, such as "Q7245". */
  id: string
  uri: string
  label?: string
  description?: string
  /** As precise as Wikidata states it: "1835-11-30", "1835-11" or "1835". */
  born?: string
  died?: string
  birthplace?: string
  deathplace?: string
  occupations: string[]
  /** Pen names (P742). */
  pseudonyms: string[]
  /** A Commons thumbnail. */
  image?: string
  /** The English Wikipedia article's title. */
  wikipedia?: string
}

const sparqlUrl = 'https://query.wikidata.org/sparql'
const apiUrl = 'https://www.wikidata.org/w/api.php'

/** The Wikidata item that records this LCCN, or null if none does. */
export async function wikidataItemFor(lccn: string, signal?: AbortSignal): Promise<string | null> {
  // The value is an LCCN, checked so nothing else reaches the query.
  if (!/^[a-z]+\d+$/.test(lccn)) return null
  const query = `SELECT ?item WHERE { ?item wdt:P244 "${lccn}" } LIMIT 2`
  const response = await fetch(`${sparqlUrl}?${new URLSearchParams({ query, format: 'json' })}`, {
    signal,
    headers: { Accept: 'application/sparql-results+json' },
  })
  if (!response.ok) throw new Error(`Wikidata returned ${response.status}`)
  const json = (await response.json()) as { results?: { bindings?: { item?: { value?: string } }[] } }
  const items = (json.results?.bindings ?? []).flatMap((b) => (b.item?.value ? [b.item.value] : []))
  // Two items claiming one LCCN is a Wikidata problem to fix, not a match to guess at.
  if (items.length !== 1) return null
  return (items[0] as string).split('/').pop() ?? null
}

export async function fetchWikidata(lccn: string, signal?: AbortSignal): Promise<WikidataFacts | null> {
  const id = await wikidataItemFor(lccn, signal)
  if (!id) return null
  const entity = await getEntities([id], 'labels|descriptions|claims|sitelinks', signal).then((all) => all[id])
  if (!entity) return null
  const facts = fromEntity(id, entity)
  const items = [...new Set(Object.values(facts.refs).flat())]
  const labels = items.length > 0 ? await getEntities(items, 'labels', signal) : {}
  const name = (item: string) => labelOf(labels[item]) ?? item
  return {
    ...facts.facts,
    birthplace: facts.refs.birthplace[0] && name(facts.refs.birthplace[0]),
    deathplace: facts.refs.deathplace[0] && name(facts.refs.deathplace[0]),
    occupations: facts.refs.occupations.map(name),
  }
}

export interface Entity {
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } }; rank?: string }[]>
  sitelinks?: Record<string, { title: string }>
}

async function getEntities(ids: string[], props: string, signal?: AbortSignal): Promise<Record<string, Entity>> {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: ids.slice(0, 50).join('|'),
    props,
    languages: 'en',
    sitefilter: 'enwiki',
    format: 'json',
    origin: '*',
  })
  const response = await fetch(`${apiUrl}?${params}`, { signal })
  if (!response.ok) throw new Error(`Wikidata returned ${response.status}`)
  const json = (await response.json()) as { entities?: Record<string, Entity> }
  return json.entities ?? {}
}

function labelOf(entity: Entity | undefined): string | undefined {
  return entity?.labels?.en?.value
}

/** The facts an item states itself, and the items it names whose labels are still to fetch. */
export function fromEntity(
  id: string,
  entity: Entity,
): { facts: WikidataFacts; refs: { birthplace: string[]; deathplace: string[]; occupations: string[] } } {
  const values = (prop: string): unknown[] =>
    (entity.claims?.[prop] ?? [])
      .filter((claim) => claim.rank !== 'deprecated')
      .map((claim) => claim.mainsnak?.datavalue?.value)
      .filter((value) => value !== undefined)
  const items = (prop: string): string[] =>
    values(prop).flatMap((v) => (typeof v === 'object' && v !== null && 'id' in v ? [String(v.id)] : []))
  const strings = (prop: string): string[] => values(prop).filter((v): v is string => typeof v === 'string')
  const image = strings('P18')[0]
  return {
    facts: {
      id,
      uri: `https://www.wikidata.org/wiki/${id}`,
      label: labelOf(entity),
      description: entity.descriptions?.en?.value,
      born: date(values('P569')[0]),
      died: date(values('P570')[0]),
      occupations: [],
      pseudonyms: strings('P742'),
      image: image && `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=160`,
      wikipedia: entity.sitelinks?.enwiki?.title,
    },
    refs: { birthplace: items('P19').slice(0, 1), deathplace: items('P20').slice(0, 1), occupations: items('P106').slice(0, 4) },
  }
}

/** A Wikidata time, to the precision it states: day (11), month (10) or year (9 and coarser). */
export function date(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('time' in value)) return undefined
  const match = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(String(value.time))
  if (!match) return undefined
  const [, sign, year, month, day] = match as unknown as [string, string, string, string, string]
  const precision = 'precision' in value ? Number(value.precision) : 9
  const y = `${sign === '-' ? '-' : ''}${year.replace(/^0+(?=\d{4})/, '')}`
  if (precision >= 11) return `${y}-${month}-${day}`
  if (precision === 10) return `${y}-${month}`
  return y
}
