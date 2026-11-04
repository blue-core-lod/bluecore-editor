import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { Draft } from './drafts'
import type { PastEdit } from './edits'

/** The editor's own database in this browser: drafts of unsaved work, and the edits saved from here. */
interface Schema extends DBSchema {
  drafts: { key: string; value: Draft }
  edits: { key: string; value: PastEdit }
}

let database: Promise<IDBPDatabase<Schema>> | undefined

export function db(): Promise<IDBPDatabase<Schema>> {
  database ??= openDB<Schema>('bluecore-editor', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('drafts', { keyPath: 'id' })
      if (oldVersion < 2) db.createObjectStore('edits', { keyPath: 'id' })
    },
  })
  return database
}
