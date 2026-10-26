import { getNode, type Doc, type Key, type Literal, type Node, type Value } from './model'

/**
 * The small edits a change is made of. Each names its target by key, and each
 * carries what it expects to find there, so applying one to a document that
 * has moved on fails loudly instead of editing the wrong thing. That check is
 * what lets one change be undone out of order: replaying the rest without it
 * either works, or says which later changes depended on it.
 */
export type Op =
  /** Replace a literal. */
  | { op: 'set'; node: Key; prop: string; value: Key; from: Literal; to: Literal }
  /** Add a value after another (null for first), with the nodes it brings. */
  | { op: 'insert'; node: Key; prop: string; after: Key | null; value: Value; nodes: Node[] }
  /** Remove a value, and its nodes if it holds one. */
  | { op: 'remove'; node: Key; prop: string; value: Key }
  /** Change a JSON-LD keyword such as @type; undefined means absent. */
  | { op: 'keyword'; node: Key; name: string; from: unknown; to: unknown }

export class ConflictError extends Error {}

/**
 * Apply one op, returning a new document. Only the nodes it touches are
 * copied; everything else is shared with the old document, so a view that
 * renders one node can tell cheaply whether that node changed.
 */
export function apply(doc: Doc, op: Op): Doc {
  const node = doc.nodes[op.node]
  if (!node) throw new ConflictError(`${describe(op)}: the node is gone`)
  switch (op.op) {
    case 'set': {
      const values = node.props[op.prop] ?? []
      const index = values.findIndex((value) => value.key === op.value)
      const current = values[index]
      if (!current || !('literal' in current)) throw new ConflictError(`${describe(op)}: the value is gone`)
      if (!sameJson(current.literal, op.from)) {
        throw new ConflictError(`${describe(op)}: the value has changed since`)
      }
      return withNode(doc, withProp(node, op.prop, values.with(index, { key: op.value, literal: op.to })))
    }
    case 'insert': {
      const values = node.props[op.prop] ?? []
      const at = op.after === null ? 0 : values.findIndex((value) => value.key === op.after) + 1
      if (at === 0 && op.after !== null) throw new ConflictError(`${describe(op)}: the value it follows is gone`)
      if (values.some((value) => value.key === op.value.key) || op.nodes.some((added) => doc.nodes[added.key])) {
        throw new ConflictError(`${describe(op)}: already there`)
      }
      const nodes = { ...doc.nodes, [node.key]: withProp(node, op.prop, values.toSpliced(at, 0, op.value)) }
      for (const added of op.nodes) nodes[added.key] = added
      return { ...doc, nodes }
    }
    case 'remove': {
      const values = node.props[op.prop] ?? []
      const removed = values.find((value) => value.key === op.value)
      if (!removed) throw new ConflictError(`${describe(op)}: the value is gone`)
      const gone = new Set('node' in removed ? subtree(doc, removed.node) : [])
      const nodes = Object.fromEntries(Object.entries(doc.nodes).filter(([key]) => !gone.has(key)))
      nodes[node.key] = withProp(
        node,
        op.prop,
        values.filter((value) => value !== removed),
      )
      return { ...doc, nodes }
    }
    case 'keyword': {
      if (!sameJson(node.keywords[op.name], op.from)) {
        throw new ConflictError(`${describe(op)}: the keyword has changed since`)
      }
      const keywords = op.to === undefined ? without(node.keywords, op.name) : { ...node.keywords, [op.name]: op.to }
      return withNode(doc, { ...node, keywords })
    }
  }
}

/** A node's key and the keys of every node below it. */
export function subtree(doc: Doc, key: Key): Key[] {
  const keys = [key]
  for (const values of Object.values(getNode(doc, key).props)) {
    for (const value of values) if ('node' in value) keys.push(...subtree(doc, value.node))
  }
  return keys
}

function withNode(doc: Doc, node: Node): Doc {
  return { ...doc, nodes: { ...doc.nodes, [node.key]: node } }
}

/**
 * A property left with no values is dropped, so it reads as never having been
 * there. One that keeps values stays where it was among the node's properties:
 * the form lists them in document order, so editing Main title mustn't move it
 * below Subtitle.
 */
function withProp(node: Node, prop: string, values: Value[]): Node {
  const props = values.length > 0 ? { ...node.props, [prop]: values } : without(node.props, prop)
  return { ...node, props }
}

/** A copy of a record without one entry. */
export function without<T>(record: Readonly<Record<string, T>>, name: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== name))
}

function describe(op: Op): string {
  return op.op === 'keyword' ? `${op.op} ${op.name}` : `${op.op} ${op.prop}`
}

/** Deep equality for JSON values; key order doesn't matter. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  )
}
