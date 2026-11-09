import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyChange, change } from '../src/doc/log'
import { denormalize, getNode, normalize, type JsonObject, type Literal, type Value } from '../src/doc/model'
import {
  addOriginalOps,
  addRomanizationOps,
  groups,
  offerFor,
  recordLanguages,
  replaceTextOps,
  type TextValue,
} from '../src/romanize/pairs'
import { convert } from '../src/romanize/scriptshifter'
import { candidates, scriptName, scriptOf, scriptOfTag, scriptOfText, tableById, tables, type Table } from '../src/romanize/tables'

function table(id: string): Table {
  const found = tableById(id)
  if (!found) throw new Error(`no table ${id}`)
  return found
}

const values = (...literals: Literal[]): Value[] => literals.map((literal, i) => ({ key: `v${i}`, literal }))

describe('scripts', () => {
  it('finds the script most of a text is in', () => {
    expect(scriptOfText('Война и мир')).toBe('cyrl')
    expect(scriptOfText('Voĭna i mir')).toBe('latn')
    expect(scriptOfText('كتاب')).toBe('arab')
    expect(scriptOfText('[1990]')).toBeUndefined()
  })

  it('calls text with kana Japanese, and with Hangul Korean, though Han is most of it', () => {
    expect(scriptOfText('日本語の本')).toBe('jpan')
    expect(scriptOfText('韓國語 한국어')).toBe('kore')
    expect(scriptOfText('中文书')).toBe('hani')
  })

  it("takes a literal's script from its tag before its letters", () => {
    expect(scriptOf({ '@value': '[Moscow]', '@language': 'ru-cyrl' })).toBe('cyrl')
    expect(scriptOf({ '@value': 'Война', '@language': 'ru' })).toBe('cyrl')
    expect(scriptOf('Война')).toBe('cyrl')
    expect(scriptOf(1990)).toBeUndefined()
    expect(scriptOfTag('zh-Hani-CN')).toBe('hani')
  })

  it('names scripts in words', () => {
    expect(scriptName('cyrl')).toBe('Cyrillic')
    expect(scriptName('hebr')).toBe('Hebrew')
  })
})

describe('tables', () => {
  it('tags every table with a language and a non-Latin script, in lowercase', () => {
    for (const table of tables) {
      expect(table.tag, table.id).toMatch(/^[a-z]{2,3}-[a-z]{4}$/)
      expect(scriptOfTag(table.tag), table.id).not.toBe('latn')
    }
  })

  it("has a MARC script code in bibframe2marc for every script but these, which get no 880 there", () => {
    // bibframe2marc's df880script map (rules/99-maps.xml, at 36a96c8).
    const mapped = new Set(['adlm', 'arab', 'aran', 'armn', 'beng', 'cyrl', 'deva', 'ethi', 'geor', 'grek', 'gujr', 'guru', 'hang', 'hani', 'hebr', 'jpan', 'khmr', 'knda', 'kore', 'laoo', 'mlym', 'mong', 'mymr', 'orya', 'sinh', 'taml', 'telu', 'thaa', 'thai', 'tibt'])
    const unmapped = new Set(tables.map((table) => scriptOfTag(table.tag) ?? '').filter((script) => !mapped.has(script)))
    expect([...unmapped].sort()).toEqual(['cans', 'cher', 'copt', 'cyrs', 'dsrt', 'glag', 'lepc', 'limb', 'mtei', 'nkoo', 'olck', 'osge', 'tfng', 'vaii'])
  })

  it("puts the tables for the record's language first, then a script's generic rules", () => {
    const cyrillic = candidates('s2r', { script: 'cyrl', languages: ['rus'] })
    expect(cyrillic[0]?.id).toBe('russian')
    expect(cyrillic[1]?.id).toBe('cyrillic_generic')
    expect(cyrillic.every((table) => scriptOfTag(table.tag) === 'cyrl')).toBe(true)
  })

  it("puts the table for the value's own tag before the record's language", () => {
    expect(candidates('s2r', { script: 'cyrl', tag: 'uk-cyrl', languages: ['rus'] })[0]?.id).toBe('ukrainian')
  })

  it('finds the tables for Traditional or Simplified Han, and for Hangul alone', () => {
    expect(candidates('s2r', { script: 'hant' }).map((table) => table.id)).toEqual(['chinese'])
    expect(candidates('s2r', { script: 'hang' }).map((table) => table.id)).toContain('korean_nonames')
  })

  it('offers only tables that go the way asked', () => {
    expect(candidates('r2s', { languages: ['chi'] }).some((table) => table.id === 'chinese')).toBe(false)
    expect(candidates('s2r', { script: 'hani' }).map((table) => table.id)).toEqual(['chinese'])
    expect(tableById('amharic')?.s2r).toBe(true)
  })
})

describe('pairs', () => {
  it("pairs a value in a non-Latin script with its romanization, as LC's data has them", () => {
    const [pair, ...rest] = groups(values('Akh, Sochi, Sochi, Sochi...', { '@language': 'ru-cyrl', '@value': 'Ах, Сочи, Сочи, Сочи...' }))
    expect(rest).toEqual([])
    expect(pair).toMatchObject({ kind: 'pair', script: 'cyrl', romanized: { key: 'v0' }, original: { key: 'v1' } })
  })

  it('pairs them in order, where a property has several of each', () => {
    const shown = groups(
      values('Russkiĭ disk', { '@language': 'ru-cyrl', '@value': 'Русский диск' }, 'Studii︠a︡ "Metadidzhital"', {
        '@language': 'ru-cyrl',
        '@value': 'Студия "Метадиджитал"',
      }),
    )
    expect(shown.map((group) => (group.kind === 'pair' ? [group.romanized.key, group.original.key] : group.value.key))).toEqual([
      ['v0', 'v1'],
      ['v2', 'v3'],
    ])
  })

  it('leaves a value with no partner on its own, and a date with a datatype out of it', () => {
    const shown = groups(values({ '@value': '1990', '@type': 'http://id.loc.gov/datatypes/edtf' }, 'Война', 'Second'))
    expect(shown.map((group) => group.kind)).toEqual(['single', 'pair'])
    expect(groups(values('Plain', 'Text')).map((group) => group.kind)).toEqual(['single', 'single'])
  })

  it('pairs a value typed in Cyrillic with no tag, by its letters', () => {
    expect(groups(values('Voĭna', 'Война'))[0]?.kind).toBe('pair')
  })

  const pairsOf = (literals: Literal[]) =>
    groups(values(...literals)).flatMap((group) => (group.kind === 'pair' ? [[group.romanized.key, group.original.key]] : []))

  it('pairs an original added after the second romanization with that one, not the first', () => {
    expect(pairsOf(['Voĭna', 'Mir', { '@value': 'Мир', '@language': 'ru-cyrl' }])).toEqual([['v1', 'v2']])
  })

  it('pairs a romanization added before the second original with that one, not the first', () => {
    const cyrillic = (text: string) => ({ '@value': text, '@language': 'ru-cyrl' })
    expect(pairsOf([cyrillic('Война'), 'Mir', cyrillic('Мир')])).toEqual([['v1', 'v2']])
  })

  it('pairs an original with the romanization after it, where there is none before', () => {
    expect(pairsOf([{ '@value': 'Война', '@language': 'ru-cyrl' }, 'Voĭna'])).toEqual([['v1', 'v0']])
  })

  it('pairs nothing with text tagged with a language alone, or with a link', () => {
    expect(pairsOf([{ '@value': 'War and peace', '@language': 'en' }, 'Война'])).toEqual([])
    expect(pairsOf(['http://id.loc.gov/authorities/names/n79021164', 'Война'])).toEqual([])
    expect(pairsOf([{ '@value': 'Voĭna', '@language': 'ru-latn' }, 'Война'])).toEqual([['v0', 'v1']])
  })
})

describe('what to offer', () => {
  it('offers romanizing text in a non-Latin script, in any field', () => {
    expect(offerFor('note', 'Война', [])).toBe('s2r')
  })

  it("offers the original script on a transcribed field, where ScriptShifter has the record's language", () => {
    expect(offerFor('mainTitle', 'Voĭna i mir', ['rus'])).toBe('r2s')
    expect(offerFor('mainTitle', 'War and peace', ['eng'])).toBeUndefined()
    expect(offerFor('bflc:simpleDate', '1990', ['rus'])).toBeUndefined()
    expect(offerFor('note', 'Voĭna', ['rus'])).toBeUndefined()
  })

  it("doesn't offer the original script on text tagged as another language", () => {
    expect(offerFor('mainTitle', { '@value': 'War and peace', '@language': 'en' }, ['rus'])).toBeUndefined()
  })
})

describe('the record', () => {
  const record = (): JsonObject => ({
    '@id': 'https://bcld.info/instances/1',
    '@type': ['Instance'],
    responsibilityStatement: ['Lev Tolstoĭ'],
    title: [{ '@type': ['Title'], mainTitle: ['Война и мир'] }],
    instanceOf: [
      { '@id': 'https://bcld.info/works/1', '@type': ['Work'], language: [{ '@id': 'http://id.loc.gov/vocabulary/languages/rus' }] },
    ],
  })

  it("reads the record's languages from the Work", () => {
    expect(recordLanguages(normalize(record()))).toEqual(['rus'])
  })

  it('adds a romanization untagged before the original, and tags the original', () => {
    const doc = normalize(record())
    const titleValue = getNode(doc, doc.root).props.title?.[0]
    if (!titleValue || !('node' in titleValue)) throw new Error('no title')
    const title = getNode(doc, titleValue.node)
    const original = title.props.mainTitle?.[0] as TextValue
    const russian = table('russian')
    const ops = addRomanizationOps(title.key, 'mainTitle', title.props.mainTitle ?? [], original, 'Voĭna i mir', russian)
    const json = denormalize(applyChange(doc, change('Romanized', ops)))
    expect((json.title as JsonObject[])[0]?.mainTitle).toEqual(['Voĭna i mir', { '@value': 'Война и мир', '@language': 'ru-cyrl' }])
  })

  it("keeps an original's language where its tag has no script, and adds the table's script", () => {
    const doc = normalize({ ...record(), responsibilityStatement: [{ '@value': 'Лев Толстой', '@language': 'ru' }] })
    const original = getNode(doc, doc.root).props.responsibilityStatement?.[0] as TextValue
    const ops = addRomanizationOps(doc.root, 'responsibilityStatement', [original], original, 'Lev Tolstoĭ', table('cyrillic_generic'))
    expect(denormalize(applyChange(doc, change('Romanized', ops))).responsibilityStatement).toEqual([
      'Lev Tolstoĭ',
      { '@value': 'Лев Толстой', '@language': 'ru-cyrl' },
    ])
  })

  it("keeps an original's own tag where it names a script", () => {
    const doc = normalize({ ...record(), responsibilityStatement: [{ '@value': 'Лев Толстой', '@language': 'und-cyrl' }] })
    const original = getNode(doc, doc.root).props.responsibilityStatement?.[0] as TextValue
    const ops = addRomanizationOps(doc.root, 'responsibilityStatement', [original], original, 'Lev Tolstoĭ', table('russian'))
    expect(ops.map((op) => op.op)).toEqual(['insert'])
  })

  it('adds the original script after a romanization, tagged', () => {
    const doc = normalize(record())
    const romanized = getNode(doc, doc.root).props.responsibilityStatement?.[0] as TextValue
    const ops = addOriginalOps(doc.root, 'responsibilityStatement', romanized, 'Лев Толстой', table('russian'))
    expect(denormalize(applyChange(doc, change('Added', ops))).responsibilityStatement).toEqual([
      'Lev Tolstoĭ',
      { '@value': 'Лев Толстой', '@language': 'ru-cyrl' },
    ])
  })

  it('romanizing again replaces the romanization, keeping its tag', () => {
    const doc = normalize({ ...record(), responsibilityStatement: [{ '@value': 'Lev Tolstoj', '@language': 'ru-latn' }] })
    const romanized = getNode(doc, doc.root).props.responsibilityStatement?.[0] as TextValue
    const next = applyChange(doc, change('Again', replaceTextOps(doc.root, 'responsibilityStatement', romanized, 'Lev Tolstoĭ')))
    expect(denormalize(next).responsibilityStatement).toEqual([{ '@value': 'Lev Tolstoĭ', '@language': 'ru-latn' }])
  })
})

describe('ScriptShifter', () => {
  afterEach(() => vi.unstubAllGlobals())

  const answer = (json: unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(json), { status })))

  it('asks for a conversion and composes what comes back, as LC data has it', async () => {
    answer({ output: 'Voĭna i mir', warnings: [] })
    const result = await convert('russian', 'Война и мир', 's2r')
    expect(result.output).toBe('Voĭna i mir')
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(String(url)).toBe('https://bibframe.org/scriptshifter/trans')
    expect(JSON.parse(String(init?.body))).toEqual({ lang: 'russian', text: 'Война и мир', t_dir: 's2r', capitalize: 'no_change' })
  })

  it('passes on warnings with a conversion', async () => {
    answer({ output: 'Kitab', warnings: ['Ambiguous'] })
    expect((await convert('arabic', 'كتاب', 's2r')).warnings).toEqual(['Ambiguous'])
  })

  it('fails on an empty conversion, saying what ScriptShifter said', async () => {
    answer({ output: '', warnings: ['An internal error occurred.'] })
    await expect(convert('nosuch', 'x', 's2r')).rejects.toThrow('An internal error occurred.')
  })

  it('fails when ScriptShifter does', async () => {
    answer({}, 500)
    await expect(convert('russian', 'x', 's2r')).rejects.toThrow('ScriptShifter returned 500')
  })
})
