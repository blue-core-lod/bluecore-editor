import { describe, expect, it } from 'vitest'

import { isUncontrolled, linked, unlinkedLabel } from '../src/doc/link'
import { getNode, normalize, type JsonObject } from '../src/doc/model'

function firstSubject(subject: JsonObject) {
  const doc = normalize({ '@id': 'http://localhost/works/1', subject: [subject] })
  const value = getNode(doc, doc.root).props.subject?.[0]
  if (!value || !('node' in value)) throw new Error('no subject node')
  return getNode(doc, value.node)
}

describe('unlinked values', () => {
  it('finds the text of a value that names something without linking to it', () => {
    expect(unlinkedLabel(firstSubject({ '@type': ['Topic'], 'rdfs:label': ['Washington'] }))).toBe('Washington')
    expect(unlinkedLabel(firstSubject({ '@type': ['Topic'], 'mads:authoritativeLabel': [{ '@value': 'Cats', '@language': 'en' }] }))).toBe(
      'Cats',
    )
    // Linked already, or nothing to go on.
    expect(unlinkedLabel(firstSubject({ '@id': 'http://id.loc.gov/authorities/subjects/sh1', 'rdfs:label': ['Cats'] }))).toBeUndefined()
    expect(unlinkedLabel(firstSubject({ '@type': ['Topic'] }))).toBeUndefined()
  })

  it('knows a value marked uncontrolled', () => {
    expect(isUncontrolled(firstSubject({ '@type': ['Topic', 'bflc:Uncontrolled'], 'rdfs:label': ['Cats'] }))).toBe(true)
    expect(isUncontrolled(firstSubject({ '@type': ['Topic'], 'rdfs:label': ['Cats'] }))).toBe(false)
  })

  it('links it, keeping its type and taking the authority’s URI, label and MARC key', () => {
    const was = {
      '@type': ['Agent', 'Person', 'bflc:Uncontrolled'],
      'rdfs:label': ['Malek, Zacharie, 2000-'],
      'bflc:marcKey': ['7001 $aMalek, Zacharie,$d2000-$eauthor.'],
      'bflc:aap-normalized': ['malekzacharie2000'],
      note: ['kept'],
    }
    expect(linked(was, { uri: 'http://id.loc.gov/authorities/names/n1', label: 'Malek, Zacharie, 2000-', marcKey: '1001 $aMalek, Zacharie,$d2000-' })).toEqual({
      '@id': 'http://id.loc.gov/authorities/names/n1',
      '@type': ['Agent', 'Person'],
      note: ['kept'],
      'rdfs:label': ['Malek, Zacharie, 2000-'],
      'bflc:marcKey': ['1001 $aMalek, Zacharie,$d2000-'],
    })
  })

  it('drops the scheme the text said it came from, which the authority may not be in', () => {
    const was = {
      '@type': ['Place', 'mads:Geographic'],
      'rdfs:label': ['Washington'],
      source: [{ '@id': 'http://id.loc.gov/authorities/subjects' }],
      'mads:isMemberOfMADSScheme': [{ '@id': 'http://id.loc.gov/authorities/subjects' }],
    }
    expect(linked(was, { uri: 'http://id.loc.gov/authorities/names/n79027224', label: 'Washington (State)' })).toEqual({
      '@id': 'http://id.loc.gov/authorities/names/n79027224',
      '@type': ['Place', 'mads:Geographic'],
      'rdfs:label': ['Washington (State)'],
    })
  })
})
