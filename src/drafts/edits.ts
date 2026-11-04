import type { Change } from '../doc/log'
import { db } from './db'

/**
 * The edits a cataloger has saved to Blue Core from this browser, kept until
 * they clear them. Blue Core records who saved a version and when; this keeps
 * what they changed, in the words the editor used for each change. Like
 * drafts, it is kept per signed-in user and never leaves the browser.
 */

export interface PastEdit {
  id: string
  user: string
  /** The Instance, which names the record. */
  uri: string
  title: string
  savedAt: Date
  /** What the save wrote, and whether each write went through. */
  resources: { kind: 'Instance' | 'Work'; uri: string; ok: boolean }[]
  changes: Pick<Change, 'id' | 'label' | 'at'>[]
}

/**
 * Record a save. A change already recorded for this record, as when a save
 * that failed in part is retried, isn't listed again.
 */
export async function recordEdit(
  user: string,
  edit: Omit<PastEdit, 'id' | 'user' | 'changes'> & { changes: readonly Change[] },
): Promise<void> {
  const recorded = new Set((await listEdits(user, edit.uri)).flatMap((past) => past.changes.map((change) => change.id)))
  const changes = edit.changes
    .filter((change) => !recorded.has(change.id))
    .map(({ id, label, at }) => ({ id, label, at }))
  await (await db()).put('edits', { ...edit, id: crypto.randomUUID(), user, changes })
}

/** This user's saved edits, newest first: all of them, or those to one record. */
export async function listEdits(user: string, uri?: string): Promise<PastEdit[]> {
  const edits = await (await db()).getAll('edits')
  return edits
    .filter((edit) => edit.user === user && (uri === undefined || edit.uri === uri))
    .toSorted((a, b) => b.savedAt.getTime() - a.savedAt.getTime())
}

/** Forget every edit this user saved from this browser. Their drafts are left alone. */
export async function clearEdits(user: string): Promise<void> {
  const database = await db()
  const transaction = database.transaction('edits', 'readwrite')
  for (const edit of await transaction.store.getAll()) {
    if (edit.user === user) await transaction.store.delete(edit.id)
  }
  await transaction.done
}

/** The edits whose title, URIs or changes contain every word of the query; all of them for an empty one. */
export function searchEdits(edits: readonly PastEdit[], query: string): PastEdit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...edits]
  return edits.filter((edit) => {
    const text = [edit.title, edit.uri, ...edit.resources.map((r) => r.uri), ...edit.changes.map((c) => c.label)]
      .join(' ')
      .toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
