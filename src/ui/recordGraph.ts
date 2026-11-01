import { componentsOf, isComplexSubject, joinHeading } from '../doc/complex'
import { unlinkedLabel } from '../doc/link'
import { getNode, type Doc, type Key, type Node, type Value } from '../doc/model'
import { principals } from '../doc/resources'
import { sourcesFor } from '../lookup/sources'
import { schemaKind } from './form'
import { isUri, literalText, refName, roleName, termLabel, titleOf, type RefLabel } from './labels'
import { recordProps, sections, structural, type ResourceKind } from './presentation'

/**
 * The record as resources and relationships, for the graph view (design.md,
 * The linked data view): the Instance and its Work, and what each links to,
 * grouped by relationship and named in cataloging terms ("Subjects",
 * "Author"). Built from the bibframe-json tree and its @id links, so it shows
 * what will be saved, without reading RDF. Transcribed text (titles, extent,
 * notes) isn't drawn; a value written as text where a link belongs is, as a
 * dead end, since it's what a MARC string didn't become.
 */

export interface GraphNode {
  /** Unique within the graph, for React. */
  id: string
  label: string
  uri?: string
  kind: 'linked' | 'unlinked' | 'complex'
  /** The value in the record, so choosing the node can go to its field. */
  valueKey: Key
}

export interface GraphGroup {
  resource: ResourceKind
  label: string
  nodes: GraphNode[]
}

export interface RecordGraph {
  title: string
  /** The two hubs: the keys of the Instance and Work nodes, for going to the top of the record. */
  instance: Key
  work: Key | null
  groups: GraphGroup[]
}

const skipped = new Set([...recordProps, ...structural.Instance, ...structural.Work])

/** Each property's place in the sidecar's sections, so groups follow the record's order. */
const order = new Map(sections.flatMap((section) => section.fields.map((field) => field.prop)).map((prop, i) => [prop, i]))

/** What the sidecar calls a property where it names one, so a group is called what its field is. */
const sidecarLabel = new Map(
  sections.flatMap((section) => section.fields.flatMap((field) => (field.on === 'Work' ? [] : [[field.prop, field.label] as const]))),
)

export function recordGraph(doc: Doc, labels: Map<string, RefLabel>): RecordGraph {
  const { instance, work } = principals(doc)
  const name = (uri: string) => refName(uri, labels)
  const groups = new Map<string, GraphGroup & { rank: number }>()

  const add = (resource: ResourceKind, label: string, rank: number, node: GraphNode) => {
    const id = `${resource} ${label}`
    const group = groups.get(id) ?? { resource, label, rank, nodes: [] }
    // A resource linked twice under one relationship is drawn once.
    if (!group.nodes.some((existing) => existing.uri && existing.uri === node.uri)) group.nodes.push(node)
    groups.set(id, group)
  }

  /** A value as a node, if it's a link, a complex subject, or text where a link belongs. */
  const asNode = (parent: Key, prop: string, value: Value): GraphNode | undefined => {
    if ('literal' in value) {
      const text = literalText(value.literal)
      const kind = schemaKind(doc, parent, prop)?.kind
      const link = kind ? kind !== 'text' : isUri(text)
      return typeof value.literal === 'string' && link && isUri(text)
        ? { id: value.key, label: name(text), uri: text, kind: 'linked', valueKey: value.key }
        : undefined
    }
    const node = getNode(doc, value.node)
    const id = node.keywords['@id']
    if (typeof id === 'string') return { id: value.key, label: name(id), uri: id, kind: 'linked', valueKey: value.key }
    if (isComplexSubject(node)) {
      return { id: value.key, label: joinHeading(componentsOf(doc, node, name)), kind: 'complex', valueKey: value.key }
    }
    const text = sourcesFor(prop).length > 0 ? unlinkedLabel(node) : undefined
    return text ? { id: value.key, label: text, kind: 'unlinked', valueKey: value.key } : undefined
  }

  const walk = (resource: ResourceKind, key: Key) => {
    for (const [prop, values] of Object.entries(getNode(doc, key).props)) {
      if (skipped.has(prop)) continue
      const rank = order.get(prop) ?? Number.MAX_SAFE_INTEGER
      for (const value of values) {
        const direct = asNode(key, prop, value)
        if (direct) {
          add(resource, labelOf(prop), rank, direct)
          continue
        }
        if (!('node' in value)) continue
        // A node described in place, such as a contribution or a publication: what it links to.
        const inner = getNode(doc, value.node)
        if (prop === 'contribution') {
          const group = roleOf(doc, inner, labels) ?? 'Contributor'
          for (const agent of inner.props.agent ?? []) {
            const node = asNode(inner.key, 'agent', agent)
            if (node) add(resource, group, rank, node)
          }
          continue
        }
        for (const [innerProp, innerValues] of Object.entries(inner.props)) {
          for (const innerValue of innerValues) {
            const node = asNode(inner.key, innerProp, innerValue)
            if (node) add(resource, `${labelOf(prop)}: ${termLabel(innerProp).toLowerCase()}`, rank, node)
          }
        }
      }
    }
  }

  walk('Instance', instance)
  if (work) walk('Work', work)
  return {
    title: titleOf(doc),
    instance,
    work,
    groups: [...groups.values()]
      .toSorted((a, b) => a.rank - b.rank)
      .map(({ resource, label, nodes }) => ({ resource, label, nodes })),
  }
}

function labelOf(prop: string): string {
  return sidecarLabel.get(prop) ?? termLabel(prop)
}

/** A contribution's role as a cataloger names the relationship: "Author". */
function roleOf(doc: Doc, contribution: Node, labels: Map<string, RefLabel>): string | undefined {
  const role = contribution.props.role?.[0]
  const id = role && 'node' in role ? getNode(doc, role.node).keywords['@id'] : undefined
  return typeof id === 'string' ? roleName(id, labels) : undefined
}
