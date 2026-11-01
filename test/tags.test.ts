import { describe, expect, it } from 'vitest'

import vocabulary from '../src/schema/bibframe-json/vocabulary.json'
import { isTagQuery, tagEntries, tagMatches } from '../src/ui/tags'

const terms = new Set(Object.keys(vocabulary.terms))

describe('MARC tag search', () => {
  it('leads every tag to a property and class bibframe-json has', () => {
    for (const entry of tagEntries) {
      expect(terms, `${entry.tag} ${entry.prop}`).toContain(entry.prop)
      if (entry.type) expect(terms, `${entry.tag} ${entry.type}`).toContain(entry.type)
    }
  })

  it('finds a field by its tag', () => {
    expect(tagMatches('490').map((entry) => entry.prop)).toEqual(['seriesStatement', 'seriesEnumeration'])
    expect(tagMatches('650').map((entry) => entry.prop)).toEqual(['subject'])
  })

  it('tells the Instance’s title from the Work’s', () => {
    expect(tagMatches('245').find((entry) => entry.prop === 'title')?.on).toBe('Instance')
    expect(tagMatches('240')[0]).toMatchObject({ prop: 'title', on: 'Work' })
  })

  it('says which kind of node a tag adds', () => {
    expect(tagMatches('020')[0]).toMatchObject({ prop: 'identifiedBy', type: 'Isbn' })
    expect(tagMatches('100')[0]).toMatchObject({ prop: 'contribution', type: 'PrimaryContribution' })
    expect(tagMatches('246')[0]).toMatchObject({ prop: 'title', type: 'VariantTitle' })
  })

  it('narrows as the tag is typed', () => {
    expect(tagMatches('65').map((entry) => entry.tag)).toEqual(['650', '651', '655'])
    expect(tagMatches('300  $b').map((entry) => entry.prop)).toEqual(['illustrativeContent'])
  })

  it('knows a tag search from a name search', () => {
    expect(isTagQuery('490')).toBe(true)
    expect(isTagQuery('series')).toBe(false)
  })
})
