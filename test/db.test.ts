import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { databaseState } from '../src/drafts/db'
import { listDrafts } from '../src/drafts/drafts'

/** The database at a version other than this editor's, held open as another tab would. */
function otherTab(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bluecore-editor', version)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('the database', () => {
  it('fails at once rather than wait on a tab with an older version open, and recovers once it closes', async () => {
    const older = await otherTab(1)
    await expect(listDrafts('lee')).rejects.toThrow(/older version/)
    expect(databaseState()).toBe('blocked')

    older.close()
    await settled()
    expect(databaseState()).toBe('ok')
    await expect(listDrafts('lee')).resolves.toEqual([])
  })

  it('lets a newer version in another tab take it over, and says so', async () => {
    await listDrafts('lee')
    const newer = await otherTab(3)
    expect(databaseState()).toBe('superseded')
    newer.close()
  })
})
