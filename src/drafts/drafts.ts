import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { SaveState } from '../api/save'
import { replay, type Log } from '../doc/log'
import type { Key } from '../doc/model'
import type { Saved } from '../doc/resources'

/**
 * Unsaved work, kept in the browser's IndexedDB so that a reload, a closed tab
 * or a crash loses nothing. What is kept is the change log and what the editor
 * last knew of Blue Core, not the document: the document is the log replayed,
 * as it is while editing.
 *
 * Drafts are keyed by the signed-in user as well as the Instance, so on a
 * shared machine one cataloger never opens another's unsaved changes.
 */

export interface Draft {
  id: string
  user: string
  uri: string
  log: Log
  saved: Saved
  /** The versions the draft was made against; Blue Core may have moved on since. */
  etags: Record<Key, string | null>
  loadedAt: Date
  updatedAt: Date
}

interface Schema extends DBSchema {
  drafts: { key: string; value: Draft }
}

let database: Promise<IDBPDatabase<Schema>> | undefined

function db(): Promise<IDBPDatabase<Schema>> {
  database ??= openDB<Schema>('bluecore-editor', 1, {
    upgrade(db) {
      db.createObjectStore('drafts', { keyPath: 'id' })
    },
  })
  return database
}

function draftId(user: string, uri: string): string {
  return `${user} ${uri}`
}

/** The draft of this Instance, if there is one, or null. Throws if drafts can't be kept here. */
export async function readDraft(user: string, uri: string): Promise<Draft | null> {
  return (await (await db()).get('drafts', draftId(user, uri))) ?? null
}

/** Every draft this user has in this browser, most recently changed first. */
export async function listDrafts(user: string): Promise<Draft[]> {
  const drafts = await (await db()).getAll('drafts')
  return drafts.filter((draft) => draft.user === user).toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function writeDraft(user: string, uri: string, state: SaveState & { loadedAt: Date }): Promise<void> {
  const { log, saved, etags, loadedAt } = state
  await (await db()).put('drafts', { id: draftId(user, uri), user, uri, log, saved, etags, loadedAt, updatedAt: new Date() })
}

export async function deleteDraft(user: string, uri: string): Promise<void> {
  await (await db()).delete('drafts', draftId(user, uri))
}

/**
 * The editing state a draft holds, or null if it no longer applies (the
 * editor's own changes failed to replay, which would mean a bug, not a
 * conflict with Blue Core).
 */
export function restore(draft: Draft): SaveState | null {
  try {
    return { log: draft.log, current: replay(draft.log.base, draft.log.changes), saved: draft.saved, etags: draft.etags }
  } catch {
    return null
  }
}
