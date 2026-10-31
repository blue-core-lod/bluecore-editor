import vocabulary from '../schema/bibframe-json/vocabulary.json'
import { config } from '../config'
import { getNode, isValueObject, type Doc, type Literal, type Node } from '../doc/model'

/**
 * Display text: what to call a property or class, and how to name a linked
 * resource from what the description says about it.
 */

const terms: Record<string, { label?: string } | undefined> = vocabulary.terms

/**
 * Where BIBFRAME's own label reads oddly in a form: "Title entity", or
 * "Publisher" for the Publication class. These are the presentation sidecar's
 * label overrides, kept out of the schema so other consumers see BIBFRAME's.
 */
const overrides: Record<string, string> = {
  Title: 'Title',
  Publication: 'Publication',
  Manufacture: 'Manufacture',
  Distribution: 'Distribution',
  Production: 'Production',
  responsibilityStatement: 'Statement of responsibility',
  editionStatement: 'Edition',
  agent: 'Agent',
  role: 'Role',
  language: 'Language',
  'rdf:value': 'Value',
  'rdfs:label': 'Label',
  'bflc:marcKey': 'MARC key',
  'bflc:aap': 'Authorized access point',
  'bflc:catalogerId': 'Cataloger ID',
}

/** A property or class name as a cataloger reads it: "mainTitle" is "Main title". */
export function termLabel(name: string): string {
  const override = overrides[name]
  if (override) return override
  const label = terms[name]?.label
  if (label) return label
  return humanize(name.includes(':') ? name.slice(name.indexOf(':') + 1) : name)
}

function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function literalText(literal: Literal): string {
  return String(isValueObject(literal) ? literal['@value'] : literal)
}

/** The @type of a node as a list, however the document wrote it. */
export function typesOf(node: Node): string[] {
  const type = node.keywords['@type']
  if (typeof type === 'string') return [type]
  return Array.isArray(type) ? type.filter((t): t is string => typeof t === 'string') : []
}

const labelProps = ['rdfs:label', 'mads:authoritativeLabel', 'skos:prefLabel']

export interface RefLabel {
  label?: string
  code?: string
}

/**
 * What the description says to call each linked resource, by URI. Blue Core
 * embeds a resource's label only where it first appears (the bounded framing
 * embeds each node once), so the second contributor with the same role, or a
 * language the Instance already names, is a bare @id that takes its label from
 * the first.
 */
export function refLabels(doc: Doc): Map<string, RefLabel> {
  const labels = new Map<string, RefLabel>()
  for (const node of Object.values(doc.nodes)) {
    listLabels(node.keywords['@list'], labels)
    const id = node.keywords['@id']
    if (typeof id !== 'string') continue
    const label = labelProps.map((prop) => firstText(node, prop)).find((text) => text !== undefined)
    const code = firstText(node, 'code')
    const known = labels.get(id)
    labels.set(id, { label: known?.label ?? label, code: known?.code ?? code })
  }
  return labels
}

/** The labels of the linked items in an RDF list, such as a complex subject's parts, which the model keeps as JSON. */
function listLabels(list: unknown, labels: Map<string, RefLabel>) {
  if (!Array.isArray(list)) return
  for (const item of list as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const json = item as Record<string, unknown>
    const id = json['@id']
    if (typeof id !== 'string' || labels.get(id)?.label) continue
    const label = labelProps
      .map((prop) => (Array.isArray(json[prop]) ? (json[prop] as unknown[])[0] : undefined))
      .map((first) => (typeof first === 'string' ? first : isValueObject(first) ? String(first['@value']) : undefined))
      .find((text) => text !== undefined)
    if (label) labels.set(id, { label })
  }
}

function firstText(node: Node, prop: string): string | undefined {
  const value = node.props[prop]?.find((value) => 'literal' in value)
  return value && 'literal' in value ? literalText(value.literal) : undefined
}

/** A linked resource's display name: its label, else its code, else the end of its URI. */
export function refName(uri: string, labels: Map<string, RefLabel>): string {
  const known = labels.get(uri)
  return known?.label ?? known?.code ?? uri.replace(/\/+$/, '').split(/[/#]/).pop() ?? uri
}

/** Where a linked resource comes from, as the badge on its chip says. */
export function sourceOf(uri: string): string | undefined {
  let host: string
  try {
    host = new URL(uri).host
  } catch {
    return undefined
  }
  if (host === new URL(config.bluecoreUrl).host) return 'Blue Core'
  if (host === 'id.loc.gov') return 'LC'
  if (host.endsWith('wikidata.org')) return 'Wikidata'
  if (host === 'id.worldcat.org' || host === 'experimental.worldcat.org') return 'FAST'
  return host
}

export function isUri(text: string): boolean {
  return /^https?:\/\/\S+$/.test(text)
}

/** "Main title : subtitle", from the Instance's first title. */
export function titleOf(doc: Doc): string {
  const title = getNode(doc, doc.root).props.title?.[0]
  if (!title || !('node' in title)) return 'Untitled'
  const part = (prop: string) => {
    const value = getNode(doc, title.node).props[prop]?.[0]
    return value && 'literal' in value ? literalText(value.literal) : undefined
  }
  return [part('mainTitle'), part('subtitle')].filter(Boolean).join(' : ') || 'Untitled'
}
