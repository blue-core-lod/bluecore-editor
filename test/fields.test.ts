import { describe, expect, it } from 'vitest'

import { normalize, type JsonObject } from '../src/doc/model'
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
  /** The example as a record of no kind guidance knows: its Work's content type taken away. */
  function untyped() {
    const bounded = example('bounded')
    const [work] = bounded.instanceOf as JsonObject[]
    if (!work) throw new Error('no Work')
    return normalize({ ...bounded, instanceOf: [{ ...work, '@type': ['Work'] }] })
  }

  it('are all offered, in their section and on their resource, for a record of no known kind', () => {
    const doc = untyped()
    const view = layout(doc, refLabels(doc))
    expect(view.type).toBeUndefined()
    const missing = Object.fromEntries(view.sections.flatMap((s) => s.missing).map((m) => [m.prop, m.resource]))
    // The example has no series statement, which goes on the Instance.
    expect(missing.seriesStatement).toBe('Instance')
    expect(view.sections.flatMap((s) => s.suggested)).toEqual([])
    // A field the description has is not offered again; it gets "Add another" instead.
    for (const section of view.sections) {
      for (const row of section.rows) expect(section.missing.map((m) => m.prop)).not.toContain(row.prop)
    }
  })

  it('are offered by how often LC uses them for that kind of record', () => {
    const doc = normalize(example('bounded'))
    const view = layout(doc, refLabels(doc))
    expect(view.type?.id).toBe('book')
    const missing = new Set(view.sections.flatMap((s) => s.missing).map((m) => m.prop))
    const suggested = new Map(view.sections.flatMap((s) => s.suggested).map((m) => [m.prop, m.share]))
    // Used in under 1% of LC's books: in Add field only.
    expect(missing.has('seriesStatement') || suggested.has('seriesStatement')).toBe(false)
    // Used in a third of them: suggested, with how often.
    expect(suggested.get('summary')).toBeGreaterThan(0.1)
    // A book's fields no section names have a section of their own.
    expect(view.sections.map((s) => s.title)).toContain('Book details')
  })
})
