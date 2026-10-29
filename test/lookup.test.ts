import { afterEach, describe, expect, it, vi } from 'vitest'

import { config } from '../src/config'
import { searchSource, searchUrl } from '../src/lookup/qa'
import { sourcesFor } from '../src/lookup/sources'

const names = { label: 'LC Names', path: 'loc/names' }

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('lookups', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('searches QA beside Blue Core', () => {
    const url = new URL(searchUrl(names, 'Twain, Mark'))
    expect(url.href.startsWith(`${config.qaUrl}authorities/search/loc/names?`)).toBe(true)
    expect(url.searchParams.get('q')).toBe('Twain, Mark')
  })

  it('reads the bare list most authorities return', async () => {
    stubFetch(200, [
      { id: 'info:lc/authorities/names/n79021164', label: 'Twain, Mark, 1835-1910', uri: 'http://id.loc.gov/authorities/names/n79021164' },
      { id: 'no uri', label: 'Dropped' },
    ])
    expect(await searchSource(names, 'Twain')).toEqual([
      { uri: 'http://id.loc.gov/authorities/names/n79021164', label: 'Twain, Mark, 1835-1910' },
    ])
  })

  it('reads results wrapped with a response header', async () => {
    stubFetch(200, { response_header: { total_records: 1 }, results: [{ uri: 'http://x.example/1', label: 'One' }] })
    expect(await searchSource(names, 'one')).toEqual([{ uri: 'http://x.example/1', label: 'One' }])
  })

  it('fails when the source does, so the lookup can say so', async () => {
    stubFetch(502, { error: 'bad gateway' })
    await expect(searchSource(names, 'Twain')).rejects.toThrow('LC Names returned 502')
  })

  it('sends no token to QA', async () => {
    const fetch = stubFetch(200, [])
    await searchSource(names, 'Twain')
    const init = fetch.mock.calls[0]?.at(1) as RequestInit | undefined
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it('gives the same empty list for a property with no sources', () => {
    expect(sourcesFor('mainTitle')).toBe(sourcesFor('partName'))
    expect(sourcesFor('subject').map((source) => source.label)).toEqual(['LC Subjects', 'LC Names'])
  })
})
