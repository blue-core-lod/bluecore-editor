import { describe, expect, it } from 'vitest'

import { normalize } from '../src/doc/model'
import { belongsOn, definitionOf, kindOf, modeledProperties } from '../src/schema/fields'
import { entryFor, newValue } from '../src/ui/form'
import { refLabels } from '../src/ui/labels'
import { layout } from '../src/ui/layout'
import { example } from './fixtures'

describe('what the schema says about a property', () => {
  it('reads linked.json first: text, a reference, or a subform', () => {
    expect(kindOf('Title', 'mainTitle')).toEqual({ kind: 'text' })
    expect(kindOf('Instance', 'extent')).toEqual({ kind: 'ref', range: 'Extent' })
    expect(kindOf('Instance', 'identifiedBy')).toEqual({ kind: 'node', definition: 'Identifier', range: 'Identifier' })
  })

  it('falls back on the ontology’s ranges for properties linked.json does not model', () => {
    expect(kindOf('Instance', 'dimensions')).toEqual({ kind: 'text' })
    expect(kindOf('Instance', 'tableOfContents')).toEqual({ kind: 'ref', range: 'TableOfContents' })
  })

  it('finds the definition a node is checked against from its types', () => {
    expect(definitionOf(['Isbn'])).toBe('Identifier')
    expect(definitionOf(['Publication'])).toBe('ProvisionActivity')
    expect(definitionOf(['Contribution', 'PrimaryContribution'])).toBe('Contribution')
    expect(definitionOf(['Text', 'Monograph', 'Work'])).toBe('Work')
    expect(definitionOf(['Extent'])).toBeUndefined()
  })

  it('places a property by its domain', () => {
    expect(belongsOn('carrier', ['Instance'])).toBe(true)
    expect(belongsOn('carrier', ['Work', 'Text'])).toBe(false)
    expect(belongsOn('content', ['Instance'])).toBe(false)
  })

  it('lists the fields a subform offers', () => {
    expect(modeledProperties('Title')).toEqual(['mainTitle', 'subtitle', 'partNumber', 'partName'])
    expect(modeledProperties('Contribution')).toEqual(['agent', 'role'])
  })
})

describe('new values', () => {
  it('are text, a labelled node, a link with its label, or a typed node', () => {
    expect(newValue(entryFor({ kind: 'text' }), { text: ' 2nd edition ' })).toBe('2nd edition')
    expect(newValue(entryFor({ kind: 'ref', range: 'Extent' }), { text: '355 pages' })).toEqual({
      '@type': ['Extent'],
      'rdfs:label': ['355 pages'],
    })
    expect(
      newValue(entryFor({ kind: 'ref' }), { uri: 'http://id.loc.gov/authorities/genreForms/gf2014026339', label: 'Novels' }),
    ).toEqual({ '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026339', 'rdfs:label': ['Novels'] })
    expect(newValue(entryFor({ kind: 'node', definition: 'Identifier', range: 'Identifier' }), { type: 'Lccn' })).toEqual({
      '@type': ['Lccn'],
    })
  })

  it('are nothing until something is entered', () => {
    expect(newValue(entryFor({ kind: 'text' }), { text: '  ' })).toBeNull()
    expect(newValue(entryFor({ kind: 'ref' }), { uri: 'not a uri' })).toBeNull()
  })

  it('offer the range first among its subclasses', () => {
    const entry = entryFor({ kind: 'node', definition: 'Identifier', range: 'Identifier' })
    expect(entry.entry === 'node' && entry.types.slice(0, 1)).toEqual(['Identifier'])
    expect(entry.entry === 'node' && entry.types).toContain('Isbn')
  })
})

describe('missing fields', () => {
  it('are offered in their section, on the resource they belong to', () => {
    const doc = normalize(example('bounded'))
    const sections = layout(doc, refLabels(doc)).sections
    const subjects = sections.find((section) => section.title === 'Subjects and genre/form')
    const missing = Object.fromEntries(sections.flatMap((s) => s.missing).map((m) => [m.prop, m.resource]))
    // The example has no series statement, which goes on the Instance.
    expect(missing.seriesStatement).toBe('Instance')
    expect(subjects).toBeDefined()
    // A field the description has is not offered again; it gets "Add another" instead.
    for (const section of sections) {
      for (const row of section.rows) expect(section.missing.map((m) => m.prop)).not.toContain(row.prop)
    }
  })
})
