import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { Draft } from './drafts'
import type { PastEdit } from './edits'

/** The editor's own database in this browser: drafts of unsaved work, and the edits saved from here. */
interface Schema extends DBSchema {
  drafts: { key: string; value: Draft }
  edits: { key: string; value: PastEdit }
}

/**
 * Whether this tab can use the database: "blocked" while a tab with an older
 * version of the editor holds it open, "superseded" once a newer version in
 * another tab has taken it over.
 */
export type DatabaseState = 'ok' | 'blocked' | 'superseded'

let state: DatabaseState = 'ok'
const listeners = new Set<() => void>()

function setState(next: DatabaseState) {
  state = next
  for (const listener of listeners) listener()
}

export function databaseState(): DatabaseState {
  return state
}

export function onDatabaseState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** How long opening may take before it counts as held up, for a browser that doesn't say it's blocked. */
const patience = 1500

let database: Promise<IDBPDatabase<Schema>> | undefined

function blockedError(): Error {
  return new Error('another tab has an older version of the editor open')
}

/**
 * The database, opened once. An upgrade waits until every tab has closed the
 * older version, and only the first request to open it hears that it's
 * blocked: any other waits behind it in silence. So there is one request, and
 * while it's held up every use fails at once, and the editor carries on
 * without drafts rather than never opening the record. When the older tab
 * closes, the upgrade goes through and drafts are kept again. A tab holding an
 * older version than another needs closes it.
 */
export function db(): Promise<IDBPDatabase<Schema>> {
  if (state === 'blocked') return Promise.reject(blockedError())
  database ??= open()
  return database
}

function open(): Promise<IDBPDatabase<Schema>> {
  return new Promise<IDBPDatabase<Schema>>((resolve, reject) => {
    const heldUp = () => {
      clearTimeout(timer)
      // The request stays open, and succeeds once the older tab lets go.
      database = undefined
      setState('blocked')
      reject(blockedError())
    }
    const timer = setTimeout(heldUp, patience)
    openDB<Schema>('bluecore-editor', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('drafts', { keyPath: 'id' })
        if (oldVersion < 2) db.createObjectStore('edits', { keyPath: 'id' })
      },
      blocked: heldUp,
      blocking(_version, _newer, event) {
        ;(event.target as IDBDatabase).close()
        database = undefined
        setState('superseded')
      },
    }).then(
      (opened) => {
        clearTimeout(timer)
        database = Promise.resolve(opened)
        if (state === 'blocked') setState('ok')
        resolve(opened)
      },
      (error: unknown) => {
        clearTimeout(timer)
        database = undefined
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
