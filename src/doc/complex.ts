import { getNode, isValueObject, type Doc, type Json, type JsonObject, type Node } from './model'
import { without } from './patch'

/**
 * A complex subject: an LCSH heading built from parts, such as
 * "Married women--California". Blue Core holds one as a blank node typed
 * mads:ComplexSubject, with the whole heading as its label and the parts, in
 * order, as an RDF list in mads:componentList. Each part is an LC authority
 * where LC has one, and a typed label where it doesn't.
 *
 * The document model keeps the list verbatim (it's a keyword, @list), so the
 * editor reads it here and replaces the whole subject when it changes.
 */

export const lcsh = 'http://id.loc.gov/authorities/subjects'

export interface Component {
  label: string
  /** The MADS class, such as "mads:Topic" or "mads:Geographic". */
  type: string
  uri?: string
  /** The authority's MARC key, such as "181  $zCalifornia", which says what subfield it is. */
  marcKey?: string
}

/** The kinds an unlinked part can be, as MARC subdivides a heading. */
export const kinds: { type: string; label: string }[] = [
  { type: 'mads:Topic', label: 'Topical' },
  { type: 'mads:Geographic', label: 'Geographic' },
  { type: 'mads:Temporal', label: 'Chronological' },
  { type: 'mads:GenreForm', label: 'Form' },
]

export function isComplexSubject(node: Node): boolean {
  const type = node.keywords['@type']
  return Array.isArray(type) ? type.includes('mads:ComplexSubject') : type === 'mads:ComplexSubject'
}

/**
 * The parts of a complex subject, in order. Blue Core embeds a resource once,
 * so a part another subject already has, such as "California" in a second
 * heading, may be a bare @id: it takes its type, label and MARC key from where
 * the document describes it, and failing that its label from `name`. A
 * subject with no list is split from its label, its parts unlinked.
 */
export function componentsOf(doc: Doc, node: Node, name: (uri: string) => string): Component[] {
  const list = node.props['mads:componentList']?.[0]
  const items = list && 'node' in list ? getNode(doc, list.node).keywords['@list'] : undefined
  if (!Array.isArray(items)) {
    const label = firstText(node.props['mads:authoritativeLabel']) ?? firstText(node.props['rdfs:label']) ?? ''
    return splitHeading(label).map((part) => ({ label: part, type: 'mads:Topic' }))
  }
  const described = listed(doc)
  return (items as Json[]).map((item) => {
    const own = componentFrom(item)
    const known = own.uri ? described.get(own.uri) : undefined
    const label = own.label || known?.label || (own.uri ? name(own.uri) : '')
    const type = own.type ?? known?.type ?? 'mads:Topic'
    const marcKey = own.marcKey ?? known?.marcKey
    return { label, type, ...(own.uri ? { uri: own.uri } : {}), ...(marcKey ? { marcKey } : {}) }
  })
}

/** What a list item says of itself; any of it may be missing. */
function componentFrom(item: Json): Partial<Component> & { label: string } {
  if (typeof item === 'string') return { label: '', uri: item }
  const json = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  const uri = typeof json['@id'] === 'string' ? json['@id'] : undefined
  const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']]
  const type = types.find((t): t is string => typeof t === 'string' && t.startsWith('mads:'))
  const label = jsonText(json['mads:authoritativeLabel']) ?? jsonText(json['rdfs:label']) ?? ''
  const marcKey = jsonText(json['bflc:marcKey'])
  return { label, ...(uri ? { uri } : {}), ...(type ? { type } : {}), ...(marcKey ? { marcKey } : {}) }
}

/** Every linked part described in any of the document's lists, by URI. */
function listed(doc: Doc): Map<string, Partial<Component>> {
  const found = new Map<string, Partial<Component>>()
  for (const node of Object.values(doc.nodes)) {
    const items = node.keywords['@list']
    if (!Array.isArray(items)) continue
    for (const item of items as Json[]) {
      const component = componentFrom(item)
      if (!component.uri || (!component.type && !component.marcKey)) continue
      const known = found.get(component.uri)
      if (!known?.marcKey) found.set(component.uri, { ...known, ...component })
    }
  }
  return found
}

/** The MARC subfield a part is: "a" for the first, then x, y, z or v as its authority or its kind says. */
export function subfield(component: Component, index: number): string {
  const coded = component.marcKey ? /\$(\w)/.exec(component.marcKey)?.[1] : undefined
  if (index === 0) return coded ?? 'a'
  // A heading's own $a, used as a subdivision, is subdivided by its kind.
  if (coded && coded !== 'a') return coded
  return { 'mads:Geographic': 'z', 'mads:Temporal': 'y', 'mads:GenreForm': 'v' }[component.type] ?? 'x'
}

/**
 * The parts of a heading as typed. A "--" followed by another hyphen belongs
 * to an open date: "Twain, David, 1929---Interviews" is two parts.
 */
export function splitHeading(text: string): string[] {
  return text.split(/--(?!-)/).map((part) => part.trim())
}

export function joinHeading(components: readonly Component[]): string {
  return components.map((component) => component.label).join('--')
}

/** The properties rebuilt from the parts; the rest of an edited subject is kept. */
const rebuilt = ['rdfs:label', 'mads:authoritativeLabel', 'mads:componentList', 'bflc:aap', 'bflc:aap-normalized']

/**
 * A complex subject as bibframe-json, in the shape Blue Core holds. Editing
 * one passes what it was, so what the editor doesn't touch stays; the access
 * points derived from the old heading go, since they would no longer match.
 */
export function complexSubject(components: readonly Component[], was?: JsonObject): JsonObject {
  const heading = joinHeading(components)
  const kept = rebuilt.reduce<JsonObject>((json, prop) => without(json, prop) as JsonObject, was ?? {})
  return {
    '@type': ['Topic', 'mads:ComplexSubject'],
    'mads:isMemberOfMADSScheme': [{ '@id': lcsh }],
    source: [{ '@id': lcsh }],
    ...kept,
    'rdfs:label': [heading],
    'mads:authoritativeLabel': [heading],
    'mads:componentList': [{ '@list': components.map(componentJson) }],
  }
}

function componentJson(component: Component): JsonObject {
  return {
    ...(component.uri ? { '@id': component.uri } : {}),
    '@type': [component.type],
    'mads:authoritativeLabel': [component.label],
    ...(component.marcKey ? { 'bflc:marcKey': [component.marcKey] } : {}),
  }
}

function firstText(values: Node['props'][string] | undefined): string | undefined {
  const value = values?.find((value) => 'literal' in value)
  if (!value || !('literal' in value)) return undefined
  return String(isValueObject(value.literal) ? value.literal['@value'] : value.literal)
}

function jsonText(json: Json | undefined): string | undefined {
  const first = Array.isArray(json) ? json[0] : json
  if (typeof first === 'string') return first
  if (isValueObject(first)) return String(first['@value'])
  return undefined
}
