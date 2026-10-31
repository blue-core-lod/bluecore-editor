import { afterEach, describe, expect, it, vi } from 'vitest'

import { config } from '../src/config'
import { searchVocabulary } from '../src/lookup/local'
import { browseUrl, isHeading } from '../src/lookup/browse'
import { sameHeading } from '../src/lookup/normalize'
import { browses, searchSource, searchUrl } from '../src/lookup/qa'
import { isLocal, sourcesFor, type QaSource, type Source } from '../src/lookup/sources'

const names: QaSource = { label: 'LC Names', path: 'loc/names' }

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

describe('vendored vocabularies', () => {
  const labels = (hits: { label: string }[]) => hits.map((hit) => hit.label)

  it('matches the MARC code first', () => {
    expect(searchVocabulary('relators', 'aut')[0]).toEqual({
      uri: 'http://id.loc.gov/vocabulary/relators/aut',
      label: 'author',
      code: 'aut',
    })
  })

  it('matches the start of a label, unlike QA', () => {
    expect(labels(searchVocabulary('languages', 'Engl'))[0]).toBe('English')
  })

  it('matches the start of any word, then anything containing the text', () => {
    const found = labels(searchVocabulary('languages', 'old'))
    expect(found).toContain('English, Old (ca. 450-1100)')
    expect(labels(searchVocabulary('carriers', 'disc'))).toContain('audio disc')
  })

  it('offers a short list whole before anything is typed, and a long one not at all', () => {
    expect(searchVocabulary('mediaTypes', '')).toHaveLength(10)
    expect(searchVocabulary('languages', '')).toEqual([])
  })

  it('searches the vendored list for a vocabulary source, without a request', async () => {
    const fetch = stubFetch(200, [])
    const [role] = sourcesFor('role')
    if (!role) throw new Error('no source for role')
    expect(isLocal(role)).toBe(true)
    expect(labels(await searchSource(role, 'editor'))[0]).toBe('editor')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('heading browse', () => {
  afterEach(() => vi.unstubAllGlobals())

  const lcNames = sourcesFor('agent')[0] as QaSource

  it('browses for text shaped like a heading, and searches by keyword otherwise', () => {
    expect(isHeading('Twain, Mark')).toBe(true)
    expect(isHeading('United States. Congress. House')).toBe(true)
    expect(isHeading('Dogs--Training')).toBe(true)
    expect(isHeading('pynchon lot 49')).toBe(false)
    expect(browses(lcNames, 'United States. Congress. House')).toBe(true)
    expect(browses(lcNames, 'congress house')).toBe(false)
    expect(browses(sourcesFor('role')[0] as Source, 'editor, ')).toBe(false)
  })

  it('asks id.loc.gov for headings that begin with the text, written as LC writes them', () => {
    const url = new URL(browseUrl('subjects', ' United States -- History '))
    expect(url.origin + url.pathname).toBe('https://id.loc.gov/authorities/subjects/suggest2/')
    expect(url.searchParams.get('searchtype')).toBe('leftanchored')
    expect(url.searchParams.get('q')).toBe('United States--History')
  })

  it('finds the authorized heading, and the variant a match came from', async () => {
    const fetch = stubFetch(200, {
      searchtype: 'left-anchored',
      hits: [
        { aLabel: 'United States. Congress. House', vLabel: '', uri: 'http://id.loc.gov/authorities/names/n79107874' },
        {
          aLabel: 'United States. Congress. House. Committee on Merchant Marine and Fisheries. Ad Hoc Select Subcommittee on Maritime Education and Training',
          vLabel: 'United States. Congress. House. Ad Hoc Select Subcommittee on Maritime Education and Training',
          uri: 'http://id.loc.gov/authorities/names/n78075017',
        },
      ],
    })
    const hits = await searchSource(lcNames, 'United States. Congress. House')
    expect(String(fetch.mock.calls[0]?.at(0))).toContain('searchtype=leftanchored')
    expect(hits[0]).toEqual({ uri: 'http://id.loc.gov/authorities/names/n79107874', label: 'United States. Congress. House' })
    expect(hits[1]?.variant).toBe('United States. Congress. House. Ad Hoc Select Subcommittee on Maritime Education and Training')
  })

  it('searches QA by keyword for anything else', async () => {
    const fetch = stubFetch(200, [])
    await searchSource(lcNames, 'congress house')
    expect(String(fetch.mock.calls[0]?.at(0))).toContain(`${config.qaUrl}authorities/search/loc/names?`)
  })
})

describe('forgiving punctuation', () => {
  afterEach(() => vi.unstubAllGlobals())

  const lcNames = sourcesFor('agent')[0] as QaSource

  it('compares headings as NACO does', () => {
    expect(sameHeading('United States Congress. Senate.', 'United States. Congress. Senate')).toBe(true)
    expect(sameHeading('Jews -- Germany', 'Jews--Germany')).toBe(true)
    expect(sameHeading('Gödel, Kurt', 'godel kurt')).toBe(true)
    expect(sameHeading('Washington', 'Washington (State)')).toBe(false)
    expect(sameHeading('', '--')).toBe(false)
  })

  it('puts a heading that is the text first, though the keyword search buries it', async () => {
    const senate = { uri: 'http://id.loc.gov/authorities/names/n79055105', label: 'United States. Congress. Senate' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('suggest2')
          ? Response.json({ hits: [{ aLabel: senate.label, uri: senate.uri }, { aLabel: 'United States. Congress. Senate (37th)', uri: 'x:2' }] })
          : Response.json([{ uri: 'x:1', label: 'United States. Congress. Senate. Select Committee' }, senate]),
      ),
    )
    const hits = await searchSource(lcNames, 'United States Congress Senate')
    expect(hits.map((hit) => hit.uri)).toEqual([senate.uri, 'x:1'])
  })

  it('keeps the keyword results when the browse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('suggest2') ? new Response('', { status: 503 }) : Response.json([{ uri: 'x:1', label: 'One' }]),
      ),
    )
    expect(await searchSource(lcNames, 'one')).toEqual([{ uri: 'x:1', label: 'One' }])
  })
})
