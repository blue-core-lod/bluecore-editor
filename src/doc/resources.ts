import { denormalize, getNode, type Doc, type Json, type JsonObject, type Key, type Value } from './model'
import { sameJson, subtree, without, type Op } from './patch'

/**
 * Bounded in, linked out. The editor reads an Instance and its Work as one
 * bounded description and saves each as a linked description of its own.
 *
 * Blue Core stores every resource as a linked bibframe-json document, and its
 * own bounded serialization (cbd.jsonld) is a flat graph rather than
 * bibframe-json's bounded shape. So the client builds the bounded document:
 * the Instance, with its Work embedded under instanceOf.
 */
export function assembleBounded(instance: JsonObject, work: JsonObject): JsonObject {
  const workId = work['@id']
  const instanceOf = instance.instanceOf
  if (typeof workId !== 'string' || !Array.isArray(instanceOf)) {
    throw new Error('the Instance and Work do not link up')
  }
  const index = instanceOf.findIndex((ref) => idOf(ref) === workId)
  if (index === -1) throw new Error(`the Instance is not an instanceOf ${workId}`)
  return { ...instance, instanceOf: instanceOf.with(index, without(work, '@context')) }
}

/** The keys of the resources a save writes: the Instance, and its Work. */
export function principals(doc: Doc): { instance: Key; work: Key | null } {
  const root = getNode(doc, doc.root)
  const work = (root.props.instanceOf ?? []).find((value) => 'node' in value && getNode(doc, value.node).keywords['@id'])
  return { instance: doc.root, work: work && 'node' in work ? work.node : null }
}

/**
 * Move values from one node to another, as when Dimensions entered on the Work
 * goes to the Instance: each is removed, then added after the target's own
 * values, with the nodes it holds and their keys unchanged.
 */
export function moveOps(doc: Doc, from: Key, prop: string, values: readonly Value[], to: Key): Op[] {
  let after = getNode(doc, to).props[prop]?.at(-1)?.key ?? null
  const removes: Op[] = values.map((value) => ({ op: 'remove', node: from, prop, value: value.key }))
  const inserts: Op[] = values.map((value) => {
    // The value's own node now hangs on the target; the nodes below it are unchanged.
    const nodes =
      'node' in value
        ? subtree(doc, value.node).map((key) => {
            const node = getNode(doc, key)
            return key === value.node ? { ...node, parent: { node: to, prop, value: value.key } } : node
          })
        : []
    const op: Op = { op: 'insert', node: to, prop, after, value, nodes }
    after = value.key
    return op
  })
  return [...removes, ...inserts]
}

/** The document with one node's @id changed, as when Blue Core mints a URI for a new resource. */
export function withId(doc: Doc, key: Key, uri: string): Doc {
  const node = getNode(doc, key)
  return { ...doc, nodes: { ...doc.nodes, [key]: { ...node, keywords: { ...node.keywords, '@id': uri } } } }
}

/** The resource a node's data is saved with: where its Work/Instance badge comes from. */
export function resourceOf(doc: Doc, key: Key): Key {
  const { work } = principals(doc)
  let node = getNode(doc, key)
  while (node.key !== work && node.parent !== null) node = getNode(doc, node.parent.node)
  return node.key
}

/**
 * One resource as the linked description Blue Core stores: everything below
 * it, except that another principal resource is a bare URI rather than
 * embedded, and with the document's @context. Empty nodes are left out (see
 * isEmpty).
 */
export function linkedResource(doc: Doc, key: Key): JsonObject {
  const { work } = principals(doc)
  const context = getNode(doc, doc.root).keywords['@context'] as Json | undefined
  const json = withoutEmpty(denormalize(doc, key))
  if (key === doc.root && work) {
    const workId = getNode(doc, work).keywords['@id'] as string
    json.instanceOf = (json.instanceOf as Json[]).map((ref) => (idOf(ref) === workId ? workId : ref))
  }
  return context === undefined ? json : { '@context': context, ...json }
}

/** The resources whose linked description differs between two versions of a document. */
export function changedResources(base: Doc, current: Doc): Key[] {
  const resources = Object.values(principals(current)).filter((key): key is Key => key !== null)
  return resources.filter(
    (key) => !base.nodes[key] || !sameJson(linkedResource(base, key), linkedResource(current, key)),
  )
}

/**
 * Whether a node says nothing yet: no URI, no value, and nothing in it but
 * other empty nodes, as an Identifier is when its type has been chosen and
 * nothing filled in. A save leaves these out, and the view says so.
 */
export function isEmpty(doc: Doc, key: Key): boolean {
  const node = getNode(doc, key)
  if (Object.keys(node.keywords).some((name) => name !== '@type')) return false
  return Object.values(node.props).every((values) => values.every((value) => 'node' in value && isEmpty(doc, value.node)))
}

/** The same JSON without the nodes isEmpty describes, nor the properties left with no values. */
function withoutEmpty<T extends Json>(json: T): T {
  if (Array.isArray(json)) {
    return json.map(withoutEmpty).filter((value) => !emptyNode(value)) as T
  }
  if (json === null || typeof json !== 'object') return json
  const entries = Object.entries(json).flatMap(([name, value]): [string, Json][] => {
    if (name.startsWith('@')) return [[name, value]]
    const kept = withoutEmpty(value)
    return Array.isArray(kept) && kept.length === 0 ? [] : [[name, kept]]
  })
  return Object.fromEntries(entries) as T
}

function emptyNode(json: Json): boolean {
  return json !== null && typeof json === 'object' && !Array.isArray(json) && Object.keys(json).every((name) => name === '@type')
}

function idOf(ref: Json | undefined): string | undefined {
  if (typeof ref === 'string') return ref
  if (ref && typeof ref === 'object' && !Array.isArray(ref) && typeof ref['@id'] === 'string') return ref['@id']
  return undefined
}

/**
 * What Blue Core holds of each resource, as far as the editor knows: its
 * linked description as loaded or as last saved, by key. A save writes the
 * resources whose linked description differs from it, so after a partial save
 * only the resource that failed is written again.
 */
export type Saved = Record<Key, JsonObject>

export function snapshot(doc: Doc): Saved {
  const resources = Object.values(principals(doc)).filter((key): key is Key => key !== null)
  return Object.fromEntries(resources.map((key) => [key, linkedResource(doc, key)]))
}

/** The resources a save would write, with the linked description to write for each. */
export function unsaved(doc: Doc, saved: Saved): { key: Key; json: JsonObject }[] {
  return Object.entries(snapshot(doc))
    .filter(([key, json]) => !saved[key] || !sameJson(json, saved[key]))
    .map(([key, json]) => ({ key, json }))
}
