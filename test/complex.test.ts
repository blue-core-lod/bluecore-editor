import { describe, expect, it } from 'vitest'

import { lcAuthorityId } from '../src/context/lc'
import { complexSubject, componentsOf, splitHeading, subfield, type Component } from '../src/doc/complex'
import { applyChange, change } from '../src/doc/log'
import { denormalize, getNode, normalize, type JsonObject } from '../src/doc/model'
import { replaceOps } from '../src/doc/resources'
import { browseUrl, madsType } from '../src/lookup/browse'
import {
  composed,
  fromLine,
  inLine,
  isSubdivisionRecord,
  partAt,
  partsOf,
  pickedAt,
  replacePart,
  sameHeading,
} from '../src/lookup/compose'
import { refLabels } from '../src/ui/labels'

const marriedWomen = {
  '@id': 'http://id.loc.gov/authorities/subjects/sh85081530',
  '@type': ['mads:Topic'],
  'bflc:marcKey': ['150  $aMarried women'],
  'rdfs:label': [{ '@language': 'en', '@value': 'Married women' }],
}
const california = {
  '@id': 'http://id.loc.gov/rwo/agents/n79041717-781',
  '@type': ['mads:Geographic'],
  'bflc:marcKey': ['181  $zCalifornia'],
  'rdfs:label': ['California'],
}

/** A Work with two complex subjects, the second naming California only by its @id, as Blue Core embeds a resource once. */
function work(): JsonObject {
  return {
    '@id': 'http://localhost/works/1',
    '@type': ['Work'],
    subject: [
      {
        '@type': ['Topic', 'mads:ComplexSubject'],
        'rdfs:label': ['Married women--California'],
        'mads:componentList': [{ '@list': [marriedWomen, california] }],
      },
      {
        '@type': ['Topic', 'mads:ComplexSubject'],
        'rdfs:label': ['Administration of estates--California'],
        'bflc:aap-normalized': ['administrationofestatescalifornia'],
        'mads:componentList': [
          { '@list': [{ '@type': ['mads:Topic'], 'mads:authoritativeLabel': ['Administration of estates'] }, { '@id': california['@id'] }] },
        ],
      },
    ],
  }
}

function subjects(json: JsonObject) {
  const doc = normalize(json)
  const nodes = (getNode(doc, doc.root).props.subject ?? []).map((value) => ('node' in value ? getNode(doc, value.node) : null))
  return { doc, nodes: nodes.filter((node) => node !== null) }
}

describe('complex subjects', () => {
  it('reads the parts in order, with their kinds and MARC keys', () => {
    const { doc, nodes } = subjects(work())
    const [first] = nodes
    if (!first) throw new Error('no subject')
    const parts = componentsOf(doc, first, () => '?')
    expect(parts.map((part) => [part.label, part.type])).toEqual([
      ['Married women', 'mads:Topic'],
      ['California', 'mads:Geographic'],
    ])
    expect(parts.map(subfield)).toEqual(['a', 'z'])
  })

  it('describes a bare part from where the document describes it', () => {
    const { doc, nodes } = subjects(work())
    const second = nodes[1]
    if (!second) throw new Error('no subject')
    const [estates, place] = componentsOf(doc, second, () => '?')
    expect(estates).toEqual({ label: 'Administration of estates', type: 'mads:Topic' })
    expect(place).toMatchObject({ label: 'California', type: 'mads:Geographic', marcKey: '181  $zCalifornia' })
    expect(place && subfield(place, 1)).toBe('z')
  })

  it('splits a subject with no list from its label', () => {
    const { doc, nodes } = subjects({
      '@id': 'http://localhost/works/1',
      subject: [{ '@type': ['mads:ComplexSubject'], 'rdfs:label': ['Dogs--Training'] }],
    })
    const [only] = nodes
    if (!only) throw new Error('no subject')
    expect(componentsOf(doc, only, () => '?').map((part) => part.label)).toEqual(['Dogs', 'Training'])
  })

  it('gives each part its subfield: x, y, z or v by kind after the first', () => {
    const part = (type: string): Component => ({ label: 'x', type })
    expect(['mads:Topic', 'mads:Temporal', 'mads:Geographic', 'mads:GenreForm'].map((type) => subfield(part(type), 1))).toEqual(
      ['x', 'y', 'z', 'v'],
    )
    // A heading's own $a, as a subdivision, goes by its kind.
    expect(subfield({ label: 'Germany', type: 'mads:Geographic', marcKey: '151  $aGermany' }, 2)).toBe('z')
  })

  it('splits a heading on --, but not inside an open date', () => {
    expect(splitHeading('Twain, David, 1929---Interviews')).toEqual(['Twain, David, 1929-', 'Interviews'])
    expect(splitHeading('Jews -- Germany--History')).toEqual(['Jews', 'Germany', 'History'])
  })

  it('writes the shape Blue Core holds, keeping what an edit leaves alone', () => {
    const parts: Component[] = [
      { label: 'Jews', type: 'mads:Topic', uri: 'http://id.loc.gov/authorities/subjects/sh85070361', marcKey: '150  $aJews' },
      { label: 'Biography', type: 'mads:GenreForm' },
    ]
    const json = complexSubject(parts, { '@type': ['Topic', 'mads:ComplexSubject'], note: ['kept'], 'bflc:aap-normalized': ['old'] })
    expect(json).toEqual({
      '@type': ['Topic', 'mads:ComplexSubject'],
      'mads:isMemberOfMADSScheme': [{ '@id': 'http://id.loc.gov/authorities/subjects' }],
      source: [{ '@id': 'http://id.loc.gov/authorities/subjects' }],
      note: ['kept'],
      'rdfs:label': ['Jews--Biography'],
      'mads:authoritativeLabel': ['Jews--Biography'],
      'mads:componentList': [
        {
          '@list': [
            {
              '@id': 'http://id.loc.gov/authorities/subjects/sh85070361',
              '@type': ['mads:Topic'],
              'mads:authoritativeLabel': ['Jews'],
              'bflc:marcKey': ['150  $aJews'],
            },
            { '@type': ['mads:GenreForm'], 'mads:authoritativeLabel': ['Biography'] },
          ],
        },
      ],
    })
  })

  it('replaces a subject where it was, in one change that undoes whole', () => {
    const { doc } = subjects(work())
    const root = getNode(doc, doc.root)
    const [first, second] = root.props.subject ?? []
    if (!first || !second) throw new Error('no subjects')
    const edited = applyChange(
      doc,
      change('Changed Subject', replaceOps(doc, doc.root, 'subject', second.key, complexSubject([{ label: 'Wills', type: 'mads:Topic' }]))),
    )
    const labels = (denormalize(edited).subject as JsonObject[]).map((subject) => (subject['rdfs:label'] as string[])[0])
    expect(labels).toEqual(['Married women--California', 'Wills'])
  })

  it('names list parts for the context panel', () => {
    const { doc } = subjects(work())
    expect(refLabels(doc).get(california['@id'])?.label).toBe('California')
  })
})

describe('composing a subject', () => {
  it('finds the parts of the line and the one the cursor is in', () => {
    const parts = partsOf('Jews--Germ')
    expect(parts.map((part) => part.text)).toEqual(['Jews', 'Germ'])
    expect(partAt(parts, 2)).toBe(0)
    expect(partAt(parts, 5)).toBe(0) // between the dashes
    expect(partAt(parts, 6)).toBe(1)
    expect(partAt(partsOf('Jews--'), 6)).toBe(1) // a new, empty part
  })

  it('keeps a part with dashes of its own whole in the line', () => {
    const line = `Jews--${inLine('Germany--Aachen')}--History`
    expect(partsOf(line).map((part) => fromLine(part.text))).toEqual(['Jews', 'Germany--Aachen', 'History'])
  })

  it('replaces the part being found', () => {
    const [, germ] = partsOf('Jews--Germ--History')
    if (!germ) throw new Error('no part')
    expect(replacePart('Jews--Germ--History', germ, 'Germany')).toEqual({ text: 'Jews--Germany--History', end: 13 })
  })

  it('keeps a picked part only while its text is unchanged, and makes the rest text of their kind', () => {
    const germany: Component = { label: 'Germany', type: 'mads:Geographic', uri: 'http://id.loc.gov/rwo/agents/n80125931-781' }
    const picked = { 1: germany }
    expect(pickedAt(picked, partsOf('Jews--Germany'), 1)).toBe(germany)
    expect(pickedAt(picked, partsOf('Jews--Germans'), 1)).toBeUndefined()
    expect(composed(partsOf('Jews--Germany--Sources--'), picked, { 2: 'mads:GenreForm' })).toEqual([
      { label: 'Jews', type: 'mads:Topic' },
      germany,
      { label: 'Sources', type: 'mads:GenreForm' },
    ])
  })

  it('knows an established heading however it was spaced, and a subdivision record from a heading', () => {
    expect(sameHeading('Jews--Germany--History', 'jews -- germany--history')).toBe(true)
    expect(isSubdivisionRecord({ uri: 'x', label: 'Jews', marcKey: '180  $xJews' })).toBe(true)
    expect(isSubdivisionRecord({ uri: 'x', label: 'Jews', marcKey: '150  $aJews' })).toBe(false)
  })

  it('browses LC subdivisions by collection, and reads what kind each is', () => {
    const url = new URL(browseUrl('names', 'Germany', 'http://id.loc.gov/authorities/subjects/collection_GeographicSubdivisions'))
    expect(url.searchParams.get('memberOf')).toBe('http://id.loc.gov/authorities/subjects/collection_GeographicSubdivisions')
    expect(madsType(['Geographic', 'SimpleType', 'Authority'])).toBe('mads:Geographic')
    expect(madsType(['PersonalName', 'SimpleType', 'Name', 'Authority'])).toBe('mads:PersonalName')
  })

  it('opens a geographic subdivision in the context panel as its place', () => {
    expect(lcAuthorityId('http://id.loc.gov/rwo/agents/n79041717-781')?.uri).toBe(
      'http://id.loc.gov/authorities/names/n79041717',
    )
  })
})
