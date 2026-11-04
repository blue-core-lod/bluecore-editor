import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { listDrafts } from '../src/drafts/drafts'

/** The database as an editor from before the upgrade made it, held open as its tab would. */
function olderTab(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bluecore-editor', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('the database', () => {
  it('fails at once rather than wait on a tab with an older version open, and opens once it closes', async () => {
    const older = await olderTab()
    await expect(listDrafts('lee')).rejects.toThrow(/older version/)
    older.close()
    await expect(listDrafts('lee')).resolves.toEqual([])
  })
})
