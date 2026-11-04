import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { Draft } from './drafts'
import type { PastEdit } from './edits'

/** The editor's own database in this browser: drafts of unsaved work, and the edits saved from here. */
interface Schema extends DBSchema {
  drafts: { key: string; value: Draft }
  edits: { key: string; value: PastEdit }
}

let database: Promise<IDBPDatabase<Schema>> | undefined

/**
 * The database, opened once. An upgrade waits until every tab has closed the
 * older version, so neither side waits on the other: a tab that holds an older
 * version than another needs closes it (and opens it again when next asked),
 * and an upgrade held up by an older tab fails at once, so the editor carries
 * on without drafts rather than never opening the record.
 */
export function db(): Promise<IDBPDatabase<Schema>> {
  database ??= new Promise<IDBPDatabase<Schema>>((resolve, reject) => {
    openDB<Schema>('bluecore-editor', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('drafts', { keyPath: 'id' })
        if (oldVersion < 2) db.createObjectStore('edits', { keyPath: 'id' })
      },
      blocked() {
        reject(new Error('another tab has an older version of the editor open'))
      },
      blocking(_version, _newer, event) {
        ;(event.target as IDBDatabase).close()
        database = undefined
      },
    }).then(resolve, reject)
  }).catch((error: unknown) => {
    database = undefined
    throw error
  })
  return database
}
