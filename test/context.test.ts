import { afterEach, describe, expect, it, vi } from 'vitest'

import { disagreements } from '../src/context/disagreements'
import { fetchUsage, matchingWorks, type Usage } from '../src/context/usage'
import { citation, fetchLcAuthority, marcKey, fromSuggest, hasContext, lcAuthorityId, type LcAuthority } from '../src/context/lc'
import { date, fromEntity, wikidataDescriptions, wikidataItemFor, type Entity, type WikidataFacts } from '../src/context/wikidata'

// Trimmed from id.loc.gov's suggest2 and Wikidata's wbgetentities, 2026-10-30.
const twainHit = {
  suggestLabel: 'Twain, Mark, 1835-1910',
  uri: 'http://id.loc.gov/authorities/names/n79021164',
  aLabel: 'Twain, Mark, 1835-1910',
  token: 'n79021164',
  more: {
    rdftypes: ['PersonalName', 'SimpleType', 'Name', 'Authority'],
    notes: ['[Machine-derived non-Latin script reference project.]'],
    variantLabels: ['Tvėn, Mark, 1835-1910', 'Twain, Marek, 1835-1910', 'Твен, Марк, 1835-1910'],
    occupations: ['Authors', 'Authors', 'Lecturers', 'Humorists'],
    activityfields: ['Literature', 'Humor'],
    sources: [
      'found : DAB, 1930 (Clemens, Samuel Langhorne, 1835-1910; better known under pseud. Mark Twain)',
      'found : Makū Touen tanpenshū, 1961.',
      'found : Hebrew Wikipedia, viewed 24 July 2026  (מארק טוויין = Marḳ Ṭṿen [voc.])https://he.wikipedia.org/wiki/x',
    ],
    birthplaces: ['Florida (Mo.)'],
    birthdates: ['1835-11-30'],
    deathdates: ['1910-04-21'],
    sees: ['Clemens, Samuel Langhorne, 1835-1910', 'Snodgrass, Quintus Curtius, 1835-1910', 'Conte, Louis de, 1835-1910'],
    marcKeys: ['1001 $aTwain, Mark,$d1835-1910'],
  },
}

const twainEntity: Entity = {
  labels: { en: { value: 'Mark Twain' } },
  descriptions: { en: { value: 'American author and humorist (1835–1910)' } },
  sitelinks: { enwiki: { title: 'Mark Twain' } },
  claims: {
    P569: [{ mainsnak: { datavalue: { value: { time: '+1835-11-30T00:00:00Z', precision: 11 } } }, rank: 'normal' }],
    P570: [{ mainsnak: { datavalue: { value: { time: '+1910-04-21T00:00:00Z', precision: 11 } } }, rank: 'normal' }],
    P19: [{ mainsnak: { datavalue: { value: { id: 'Q537803' } } }, rank: 'normal' }],
    P106: [
      { mainsnak: { datavalue: { value: { id: 'Q1930187' } } }, rank: 'normal' },
      { mainsnak: { datavalue: { value: { id: 'Q6625963' } } }, rank: 'deprecated' },
    ],
    P18: [{ mainsnak: { datavalue: { value: 'MarkTwain.LOC.jpg' } }, rank: 'normal' }],
    P244: [{ mainsnak: { datavalue: { value: 'n79021164' } }, rank: 'normal' }],
    P742: [
      { mainsnak: { datavalue: { value: 'Mark Twain' } }, rank: 'normal' },
      { mainsnak: { datavalue: { value: 'Louis de Conte' } }, rank: 'normal' },
      { mainsnak: { datavalue: { value: 'Thomas Jefferson Snodgrass' } }, rank: 'normal' },
    ],
  },
}

function twain(): LcAuthority {
  return fromSuggest(twainHit, 'names', 'n79021164')
}

function twainFacts(): WikidataFacts {
  return fromEntity('Q7245', twainEntity).facts
}

afterEach(() => vi.unstubAllGlobals())

describe('LC authorities', () => {
  it('recognizes the authority URIs the panel reads, and the real-world-object form of a name', () => {
    expect(lcAuthorityId('http://id.loc.gov/authorities/names/n79021164')?.id).toBe('n79021164')
    expect(lcAuthorityId('https://id.loc.gov/authorities/subjects/sh85076502.html')?.directory).toBe('subjects')
    expect(lcAuthorityId('http://id.loc.gov/rwo/agents/n79021164')?.uri).toBe('http://id.loc.gov/authorities/names/n79021164')
    expect(hasContext('http://id.loc.gov/vocabulary/relators/aut')).toBe(false)
    expect(hasContext('https://bluecore.example/works/1')).toBe(false)
  })

  it('reads the record’s evidence from a suggest2 hit', () => {
    const record = twain()
    expect(record).toMatchObject({
      label: 'Twain, Mark, 1835-1910',
      kind: 'LC name authority',
      marcKey: '100 1_ $aTwain, Mark,$d1835-1910',
      born: '1835-11-30',
      died: '1910-04-21',
      occupations: ['Authors', 'Lecturers', 'Humorists'],
    })
    expect(record.variants).toHaveLength(3)
    // Notes about how the record was made aren't about the entity.
    expect(record.notes).toEqual([])
  })

  it('spaces a MARC key as catalogers write it', () => {
    expect(marcKey('10010$aSummers, Edward Hugh,$d1969-')).toBe('100 10 $aSummers, Edward Hugh,$d1969-')
    expect(marcKey('150  $aLibraries')).toBe('150 __ $aLibraries')
  })

  it('splits a 670 into the work cited, what it says, and its link', () => {
    expect(citation(twainHit.more.sources[0] as string)).toEqual({
      title: 'DAB, 1930',
      found: 'Clemens, Samuel Langhorne, 1835-1910; better known under pseud. Mark Twain',
      url: undefined,
    })
    // Two sources in one 670: what's found is the last one's.
    expect(citation('Jacobs, 2004: t.p. (Ed Summers) ; e-mail from Ed Summers, (prefers hdg.: Summers, Ed)')).toEqual({
      title: 'Jacobs, 2004: t.p. (Ed Summers) ; e-mail from Ed Summers',
      found: 'prefers hdg.: Summers, Ed',
      url: undefined,
    })
    expect(citation(twainHit.more.sources[1] as string)).toEqual({ title: 'Makū Touen tanpenshū, 1961.', url: undefined })
    expect(citation(twainHit.more.sources[2] as string)).toMatchObject({
      title: 'Hebrew Wikipedia, viewed 24 July 2026',
      url: 'https://he.wikipedia.org/wiki/x',
    })
  })

  it('takes the record the identifier names, not another that mentions it', async () => {
    const other = { ...twainHit, uri: 'http://id.loc.gov/authorities/names/no2026050810', token: 'no2026050810' }
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => Response.json({ hits: [other, twainHit] }))
    vi.stubGlobal('fetch', fetch)
    const record = await fetchLcAuthority('http://id.loc.gov/authorities/names/n79021164')
    expect(record?.uri).toBe('http://id.loc.gov/authorities/names/n79021164')
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://id.loc.gov/authorities/names/suggest2/?q=n79021164&searchtype=keyword&count=5',
    )
  })

  it('says when id.loc.gov has no such record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ hits: [] })))
    expect(await fetchLcAuthority('http://id.loc.gov/authorities/names/n00000000')).toBeNull()
  })
})

describe('Wikidata', () => {
  it('keeps a date to the precision Wikidata states', () => {
    expect(date({ time: '+1835-11-30T00:00:00Z', precision: 11 })).toBe('1835-11-30')
    expect(date({ time: '+1835-11-00T00:00:00Z', precision: 10 })).toBe('1835-11')
    expect(date({ time: '+1835-00-00T00:00:00Z', precision: 9 })).toBe('1835')
    expect(date({ time: '-0043-03-15T00:00:00Z', precision: 11 })).toBe('-0043-03-15')
    expect(date('1835')).toBeUndefined()
  })

  it('reads an item’s facts, and the items whose labels it still needs, leaving out deprecated claims', () => {
    const { facts, refs } = fromEntity('Q7245', twainEntity)
    expect(facts).toMatchObject({
      label: 'Mark Twain',
      born: '1835-11-30',
      wikipedia: 'Mark Twain',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/MarkTwain.LOC.jpg?width=160',
    })
    expect(refs).toEqual({ birthplace: ['Q537803'], deathplace: [], occupations: ['Q1930187'] })
  })

  it('finds the item by LCCN, and only when exactly one item gives it', async () => {
    const bindings = (ids: string[]) => ({
      results: { bindings: ids.map((id) => ({ item: { value: `http://www.wikidata.org/entity/${id}` } })) },
    })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(bindings(['Q7245']))))
    expect(await wikidataItemFor('n79021164')).toBe('Q7245')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(bindings(['Q1', 'Q2']))))
    expect(await wikidataItemFor('n79021164')).toBeNull()
  })

  it('describes a page of lookup results in one query, leaving out an LCCN two items claim', async () => {
    const row = (lccn: string, description: string) => ({ lccn: { value: lccn }, description: { value: description } })
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
      Response.json({
        results: {
          bindings: [
            row('n79099184', 'American novelist (born 1937)'),
            row('n2', 'one item'),
            row('n2', 'another item'),
          ],
        },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    expect(await wikidataDescriptions('n79099184 n2 not-an-lccn')).toEqual({ n79099184: 'American novelist (born 1937)' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const query = new URL(fetch.mock.calls[0]?.[0] as string).searchParams.get('query')
    expect(query).toContain('VALUES ?lccn { "n79099184" "n2" }')
  })

  it('sends nothing that isn’t an LCCN into the query', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await wikidataItemFor('n1" } UNION { ?item ?p ?o')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('disagreements', () => {
  it('finds none where the sources agree, matching pen names to headings in any order', () => {
    const facts = { ...twainFacts(), pseudonyms: ['Mark Twain', 'Sieur Louis de Conte'] }
    expect(disagreements(twain(), facts)).toEqual([])
  })

  it('notes pen names the LC record doesn’t have, in one note', () => {
    expect(disagreements(twain(), twainFacts())).toEqual([
      'Wikidata lists a pen name, Thomas Jefferson Snodgrass, that the LC record doesn’t include as a variant.',
    ])
    const more = { ...twainFacts(), pseudonyms: ['Thomas Jefferson Snodgrass', 'J. W. Bothwell'] }
    expect(disagreements(twain(), more)).toEqual([
      'Wikidata lists pen names the LC record doesn’t include as variants: Thomas Jefferson Snodgrass; J. W. Bothwell.',
    ])
  })

  it('leaves pen names alone where Wikidata holds several LC identities in one item', () => {
    expect(disagreements(twain(), { ...twainFacts(), lcRecords: 2 })).toEqual([])
  })

  it('notes dates that differ, but not one that is only less precise', () => {
    expect(disagreements(twain(), { ...twainFacts(), pseudonyms: [], born: '1835' })).toEqual([])
    expect(disagreements(twain(), { ...twainFacts(), pseudonyms: [], died: '1911' })).toEqual([
      'Wikidata gives the death date as 1911; the LC record has 1910-04-21.',
    ])
  })
})

describe('Blue Core usage', () => {
  const usage = (titles: [string, string][]): Usage => ({
    works: titles.length,
    records: titles.length,
    usedAs: { contribution: titles.length },
    roles: {},
    recentWorks: titles.map(([uri, title]) => ({ uri, title, instances: 1 })),
  })

  it('matches a Work by its title, ignoring case, punctuation, a leading article and the subtitle', () => {
    const found = usage([
      ['https://bcld.info/works/1', 'The crying of lot 49'],
      ['https://bcld.info/works/2', 'Gravity’s rainbow'],
    ])
    expect(matchingWorks(found, 'Crying of Lot 49 : a novel').map((work) => work.uri)).toEqual([
      'https://bcld.info/works/1',
    ])
    expect(matchingWorks(found, 'Vineland')).toEqual([])
  })

  it('leaves out the record’s own Work', () => {
    const found = usage([['https://bcld.info/works/1', 'The crying of lot 49']])
    expect(matchingWorks(found, 'The crying of lot 49', 'https://bcld.info/works/1')).toEqual([])
  })

  it('reads the endpoint’s answer, and asks with the uri as a parameter', async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
      Response.json({ works: 2, records: 4, used_as: { contribution: 2 }, roles: { aut: 1 }, recent_works: [] }),
    )
    vi.stubGlobal('fetch', fetch)
    expect(await fetchUsage('http://id.loc.gov/authorities/names/n79099184')).toEqual({
      works: 2,
      records: 4,
      usedAs: { contribution: 2 },
      roles: { aut: 1 },
      recentWorks: [],
    })
    const url = new URL(fetch.mock.calls[0]?.[0] as string)
    expect(url.pathname.endsWith('/api/usage/')).toBe(true)
    expect(url.searchParams.get('uri')).toBe('http://id.loc.gov/authorities/names/n79099184')
  })
})
