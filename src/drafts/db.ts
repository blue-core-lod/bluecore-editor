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

let database: Promise<IDBPDatabase<Schema>> | undefined

/**
 * The database, opened once. An upgrade waits until every tab has closed the
 * older version, so neither side waits on the other: a tab that holds an older
 * version than another needs closes it, and an upgrade held up by an older tab
 * fails at once, so the editor carries on without drafts rather than never
 * opening the record. When the older tab closes, the upgrade goes through and
 * drafts are kept again.
 */
export function db(): Promise<IDBPDatabase<Schema>> {
  database ??= new Promise<IDBPDatabase<Schema>>((resolve, reject) => {
    let failed = false
    openDB<Schema>('bluecore-editor', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('drafts', { keyPath: 'id' })
        if (oldVersion < 2) db.createObjectStore('edits', { keyPath: 'id' })
      },
      blocked() {
        failed = true
        setState('blocked')
        reject(new Error('another tab has an older version of the editor open'))
      },
      blocking(_version, _newer, event) {
        ;(event.target as IDBDatabase).close()
        database = undefined
        setState('superseded')
      },
    }).then((opened) => {
      if (!failed) return resolve(opened)
      database = Promise.resolve(opened)
      setState('ok')
    }, reject)
  }).catch((error: unknown) => {
    database = undefined
    throw error
  })
  return database
}
