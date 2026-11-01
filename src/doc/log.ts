import { newKey, type Doc } from './model'
import { apply, ConflictError, type Op } from './patch'

/**
 * One thing the cataloger did, such as "Moved Extent to the Instance": the unit
 * the history lists, and the unit undo works on. It is applied whole or not at
 * all.
 */
export interface Change {
  id: string
  label: string
  /** ISO 8601. */
  at: string
  ops: Op[]
  /** Set on a change that made the record a kind of resource ("map"), so a suggestion to switch kinds knows a choice was made. */
  kind?: string
}

/**
 * The document as loaded plus the changes made since, in order. The current
 * document is always the replay of the changes onto the base, so the log, not
 * a mutable document, is the source of truth: it is what goes into IndexedDB,
 * and what could later map onto a CRDT.
 */
export interface Log {
  base: Doc
  changes: Change[]
}

export function change(label: string, ops: Op[]): Change {
  return { id: newKey(), label, at: new Date().toISOString(), ops }
}

export function replay(base: Doc, changes: readonly Change[]): Doc {
  return changes.reduce(applyChange, base)
}

export function applyChange(doc: Doc, change: Change): Doc {
  return change.ops.reduce(apply, doc)
}

/** Add a change to the log. Throws ConflictError if it doesn't apply. */
export function record(log: Log, current: Doc, change: Change): { log: Log; current: Doc } {
  return { log: { ...log, changes: [...log.changes, change] }, current: applyChange(current, change) }
}

export type UndoResult =
  | { ok: true; log: Log; current: Doc }
  /** Later changes that only make sense with the undone ones in place. */
  | { ok: false; dependents: Change[] }

/**
 * Undo some changes, wherever they are in the history, by replaying the base
 * without them. If a later change no longer applies, it depended on one being
 * undone (it edits a value that change added, say), so nothing is undone and
 * the dependents are returned for the cataloger to decide: undo them too, or
 * leave things as they are. Dependents are found transitively.
 */
export function undo(log: Log, ids: readonly string[]): UndoResult {
  const skip = new Set(ids)
  const dependents: Change[] = []
  let doc = log.base
  for (const change of log.changes) {
    if (skip.has(change.id)) continue
    try {
      doc = applyChange(doc, change)
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error
      dependents.push(change)
      skip.add(change.id)
    }
  }
  if (dependents.length > 0) return { ok: false, dependents }
  return { ok: true, log: { ...log, changes: log.changes.filter((change) => !skip.has(change.id)) }, current: doc }
}
