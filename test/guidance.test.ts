import { describe, expect, it } from 'vitest'

import { normalize, type JsonObject } from '../src/doc/model'
import { guidedProperties, resourceTypeOf, usage } from '../src/schema/guidance'

function record(workTypes: string[], instance: JsonObject = {}): ReturnType<typeof normalize> {
  return normalize({
    '@id': 'http://localhost/instances/1',
    '@type': ['Instance'],
    ...instance,
    instanceOf: [{ '@id': 'http://localhost/works/1', '@type': ['Work', ...workTypes] }],
  })
}

const carrier = (code: string) => ({ '@id': `http://id.loc.gov/vocabulary/carriers/${code}` })

describe('what kind of resource a record is', () => {
  it('goes by the Work’s type', () => {
    expect(resourceTypeOf(record(['Cartography', 'Monograph']))?.id).toBe('map')
    expect(resourceTypeOf(record(['NotatedMusic']))?.label).toBe('Score')
  })

  it('tells an online book from a printed one by its only carrier', () => {
    expect(resourceTypeOf(record(['Text'], { carrier: [carrier('cr')] }))?.id).toBe('book-online')
    expect(resourceTypeOf(record(['Text'], { carrier: [carrier('nc')] }))?.id).toBe('book')
    expect(resourceTypeOf(record(['Text'], { carrier: [carrier('cr'), carrier('nc')] }))?.id).toBe('book')
  })

  it('knows a serial by its issuance, whatever its Work says', () => {
    const issuance = { issuance: [{ '@id': 'http://id.loc.gov/vocabulary/issuance/serl' }] }
    expect(resourceTypeOf(record(['Text'], issuance))?.id).toBe('serial')
  })

  it('knows nothing of a record with no kind it has rules for', () => {
    expect(resourceTypeOf(record([]))).toBeUndefined()
  })
})

describe('how a kind of resource uses a property', () => {
  it('sorts properties into tiers by how many of LC’s records use them', () => {
    expect(usage('map', 'scale')).toMatchObject({ tier: 'shown', resource: 'Work' })
    expect(usage('map', 'cartographicAttributes')?.tier).toBe('suggested')
    expect(usage('map', 'copyrightDate')?.tier).toBe('available')
    expect(usage('map', 'noSuchProperty')).toEqual({ tier: 'available', share: 0, resource: 'Instance' })
  })

  it('never offers record-keeping and structure, however often it’s there', () => {
    expect(usage('book', 'adminMetadata')).toBeUndefined()
    expect(guidedProperties('book').map((p) => p.prop)).not.toContain('instanceOf')
  })

  it('lists what a kind shows and suggests, most used first', () => {
    const props = guidedProperties('map')
    expect(props.map((p) => p.prop)).toContain('baseMaterial')
    expect(props.map((p) => p.usage.share)).toEqual(props.map((p) => p.usage.share).toSorted((a, b) => b - a))
  })
})
