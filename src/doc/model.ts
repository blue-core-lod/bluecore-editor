/**
 * The document the editor works on: a bibframe-json description normalized
 * into a table of nodes, each with a client-side key.
 *
 * bibframe-json forbids an @id on a blank node, so blank nodes have nothing
 * stable to point at. The editor gives every node, and every value in every
 * array, a UUID that lives only here and never in the document. Patches refer
 * to those keys rather than to array positions, so an edit still means the
 * same thing after the values around it have moved, and two browsers never
 * mint the same key (which keeps live collaboration possible later).
 *
 * Normalization is purely structural. Whether a bare string is a URI or a
 * literal depends on the schema (Ref or Text), and that is the form's business,
 * not the store's; here a string is a string, and it goes back out unchanged.
 */

export type Key = string

export type Scalar = string | number | boolean

/** A JSON-LD value object: a literal that keeps its language or datatype. */
export interface ValueObject {
  '@value': Scalar
  '@language'?: string | null
  '@type'?: string | null
}

export type Literal = Scalar | ValueObject

/** One entry in a property's array: a literal, or a node described in place. */
export type Value = { key: Key; literal: Literal } | { key: Key; node: Key }

export interface Node {
  key: Key
  /** Where the node hangs, or null for the root. */
  parent: { node: Key; prop: string; value: Key } | null
  /** @id, @type, @context and any other JSON-LD keyword, kept verbatim. */
  keywords: Record<string, unknown>
  /** Every other property; bibframe-json makes each one an array. */
  props: Record<string, Value[]>
}

export interface Doc {
  root: Key
  nodes: Readonly<Record<Key, Node>>
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }

export function newKey(): Key {
  return crypto.randomUUID()
}

export function isValueObject(value: unknown): value is ValueObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '@value' in value
}

export class ShapeError extends Error {}

/** Normalize a whole document. It must already have the bibframe-json shape. */
export function normalize(document: JsonObject): Doc {
  const nodes: Record<Key, Node> = {}
  const root = addNode(nodes, document, null)
  return { root, nodes }
}

/**
 * Normalize one value about to be inserted under node.prop, returning the value
 * and any nodes it brings with it. The nodes are not added to a document here;
 * an insert patch carries them, so replaying the patch restores the same keys.
 */
export function fragment(json: Json, parent: { node: Key; prop: string }): { value: Value; nodes: Node[] } {
  const nodes: Record<Key, Node> = {}
  const value = toValue(nodes, json, parent)
  return { value, nodes: Object.values(nodes) }
}

function addNode(nodes: Record<Key, Node>, json: JsonObject, parent: Node['parent']): Key {
  const key = newKey()
  const node: Node = { key, parent, keywords: {}, props: {} }
  nodes[key] = node
  for (const [name, value] of Object.entries(json)) {
    if (name.startsWith('@')) {
      node.keywords[name] = value
    } else if (Array.isArray(value)) {
      node.props[name] = value.map((item) => toValue(nodes, item, { node: key, prop: name }))
    } else {
      throw new ShapeError(`${name} is not an array; every bibframe-json property is one`)
    }
  }
  return key
}

function toValue(nodes: Record<Key, Node>, json: Json, parent: { node: Key; prop: string }): Value {
  const key = newKey()
  if (json === null || Array.isArray(json)) {
    throw new ShapeError(`${parent.prop} holds ${JSON.stringify(json)}, which is neither a literal nor a node`)
  }
  if (typeof json !== 'object' || isValueObject(json)) {
    return { key, literal: json as Literal }
  }
  return { key, node: addNode(nodes, json, { ...parent, value: key }) }
}

/** The document as bibframe-json again, with every client-side key gone. */
export function denormalize(doc: Doc, key: Key = doc.root): JsonObject {
  const node = getNode(doc, key)
  const json: JsonObject = { ...(node.keywords as JsonObject) }
  for (const [name, values] of Object.entries(node.props)) {
    json[name] = values.map((value) => ('literal' in value ? (value.literal as Json) : denormalize(doc, value.node)))
  }
  return json
}

export function getNode(doc: Doc, key: Key): Node {
  const node = doc.nodes[key]
  if (!node) throw new Error(`no node ${key}`)
  return node
}
