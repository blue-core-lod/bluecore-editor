import { denormalize, fragment, getNode, type Doc, type Json, type JsonObject, type Key, type Value } from './model'
import { change, type Change } from './log'
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
 * Put a Work Blue Core already has in place of the record's own, as when a
 * new record turns out to be another edition of a work Blue Core holds. One
 * change, so it is undone like any other: the record's Work, with everything
 * entered on it, is removed, and Blue Core's linked description of the Work
 * takes its place under instanceOf. The key of the Work's node is returned,
 * so the caller can record it as saved at the version it was read at.
 */
export function replaceWork(doc: Doc, work: JsonObject, label: string): { change: Change; key: Key } {
  const { work: current } = principals(doc)
  const values = getNode(doc, doc.root).props.instanceOf ?? []
  const index = values.findIndex((value) => 'node' in value && value.node === current)
  const old = values[index]
  if (!old) throw new Error('the record has no Work to replace')
  const { value, nodes } = fragment(without(work, '@context'), { node: doc.root, prop: 'instanceOf' })
  if (!('node' in value)) throw new Error('the Work is not a node')
  const ops: Op[] = [
    { op: 'remove', node: doc.root, prop: 'instanceOf', value: old.key },
    { op: 'insert', node: doc.root, prop: 'instanceOf', after: values[index - 1]?.key ?? null, value, nodes },
  ]
  return { change: change(label, ops), key: value.node }
}

/** Put a new value in place of one a property holds, where it was: as when a complex subject is edited. */
export function replaceOps(doc: Doc, node: Key, prop: string, old: Key, json: Json): Op[] {
  const values = getNode(doc, node).props[prop] ?? []
  const index = values.findIndex((value) => value.key === old)
  if (index === -1) throw new Error(`${prop} no longer has that value`)
  const { value, nodes } = fragment(json, { node, prop })
  return [
    { op: 'remove', node, prop, value: old },
    { op: 'insert', node, prop, after: values[index - 1]?.key ?? null, value, nodes },
  ]
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

/**
 * The other Instances the Work describes, by URI, from its hasInstance: the
 * records an edit to the Work would also change. Blue Core stores the list
 * in the Work, so the record says it without another request.
 */
export function otherInstances(doc: Doc): string[] {
  const { instance, work } = principals(doc)
  if (!work) return []
  const self = getNode(doc, instance).keywords['@id']
  const uris = (getNode(doc, work).props.hasInstance ?? []).flatMap((value) => {
    if ('literal' in value) return typeof value.literal === 'string' ? [value.literal] : []
    const id = getNode(doc, value.node).keywords['@id']
    return typeof id === 'string' ? [id] : []
  })
  return [...new Set(uris)].filter((uri) => uri !== self)
}

/** Whether a change edits what is saved with the Work, rather than the Instance. */
export function changesWork(doc: Doc, change: Change): boolean {
  const { work } = principals(doc)
  // A node the change itself adds isn't in the document yet; the op that adds it names its parent.
  return work !== null && change.ops.some((op) => doc.nodes[op.node] && resourceOf(doc, op.node) === work)
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
 * isEmpty), and every linked resource it mentions is described once (see
 * describeOnce).
 */
export function linkedResource(doc: Doc, key: Key): JsonObject {
  const { work } = principals(doc)
  const context = getNode(doc, doc.root).keywords['@context'] as Json | undefined
  const json = describeOnce(doc, withoutEmpty(denormalize(doc, key)))
  if (key === doc.root && work) {
    const workId = getNode(doc, work).keywords['@id'] as string
    json.instanceOf = (json.instanceOf as Json[]).map((ref) => (idOf(ref) === workId ? workId : ref))
  }
  return context === undefined ? json : { '@context': context, ...json }
}

/**
 * Blue Core embeds a linked resource once per bounded description, so the
 * second subject with California, or the Instance's language when the Work
 * has it too, is a bare @id. But Blue Core links a resource to the record it's
 * saved with only where the saved document describes it, and drops the link
 * otherwise; the next read then has no label for it. So each resource the
 * document mentions only as a bare @id is described at its first mention,
 * from wherever the record describes it. Works, Instances and Hubs are
 * records of their own, and stay references.
 */
function describeOnce(doc: Doc, json: JsonObject): JsonObject {
  const known = descriptions(doc)
  const described = new Set<string>()
  const bare = new Set<string>()
  const scan = (value: Json) => {
    if (Array.isArray(value)) return value.forEach(scan)
    if (value === null || typeof value !== 'object') return
    const id = value['@id']
    if (typeof id === 'string') (Object.keys(value).length > 1 ? described : bare).add(id)
    Object.values(value).forEach(scan)
  }
  scan(json)
  const wanted = new Set([...bare].filter((id) => !described.has(id) && known.has(id)))
  if (wanted.size === 0) return json
  const fill = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(fill)
    if (value === null || typeof value !== 'object') return value
    const id = value['@id']
    if (typeof id === 'string' && Object.keys(value).length === 1 && wanted.has(id)) {
      wanted.delete(id)
      return known.get(id) as JsonObject
    }
    return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, fill(inner)]))
  }
  return fill(json) as JsonObject
}

const records = new Set(['Work', 'Instance', 'Hub'])

/** Where the document describes each linked resource that isn't a record of its own, by URI. */
function descriptions(doc: Doc): Map<string, JsonObject> {
  const found = new Map<string, JsonObject>()
  const add = (json: Json) => {
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return
    const id = json['@id']
    const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']]
    if (typeof id !== 'string' || Object.keys(json).length < 2 || found.has(id)) return
    if (types.some((type) => typeof type === 'string' && records.has(type))) return
    found.set(id, json)
  }
  for (const node of Object.values(doc.nodes)) {
    if (typeof node.keywords['@id'] === 'string') add(denormalize(doc, node.key))
    // A complex subject's parts are in its list, kept as JSON.
    const list = node.keywords['@list']
    if (Array.isArray(list)) (list as Json[]).forEach(add)
  }
  return found
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
