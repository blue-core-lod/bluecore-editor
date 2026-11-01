import { describe, expect, it } from 'vitest'

import { blankDescription, placeholderUri } from '../src/doc/blank'
import { replay } from '../src/doc/log'
import { denormalize, normalize, type JsonObject } from '../src/doc/model'
import { guidedProperties, inferredKind, kindChange, kindShare, resourceTypeOf, usage } from '../src/schema/guidance'

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

describe('how a kind of resource uses one kind of node', () => {
  it('measures a variant title apart from titles', () => {
    expect(kindShare('map', 'title', 'VariantTitle')).toBeLessThan(kindShare('map', 'title', 'Title') ?? 0)
  })

  it('knows nothing of a kind it never measured', () => {
    expect(kindShare('map', 'title', 'Nonesuch')).toBeUndefined()
  })
})

describe('making a new record a kind', () => {
  const blank = () => normalize(blankDescription(placeholderUri('1')))
  const made = (doc: ReturnType<typeof normalize>, id: string) => {
    const change = kindChange(doc, id)
    if (!change) throw new Error(`no change to ${id}`)
    return replay(doc, [change])
  }
  const ids = (json: unknown, prop: string) =>
    ((json as Record<string, { '@id': string }[]>)[prop] ?? []).map((value) => value['@id'].split('/').pop())

  it('starts as a book, so making it one changes nothing', () => {
    expect(resourceTypeOf(blank())?.id).toBe('book')
    expect(kindChange(blank(), 'book')).toBeNull()
  })

  it('changes the Work’s type and keeps the rest', () => {
    const map = made(blank(), 'map')
    expect(resourceTypeOf(map)?.id).toBe('map')
    const json = denormalize(map) as { '@type': string[]; instanceOf: { '@type': string[] }[] }
    expect(json.instanceOf[0]?.['@type']).toEqual(['Work', 'Cartography'])
    expect(json['@type']).toEqual(['Instance', 'Print'])
  })

  it('writes what defines an online serial, and takes it away again', () => {
    const serial = made(blank(), 'serial-online')
    expect(resourceTypeOf(serial)?.id).toBe('serial-online')
    const json = denormalize(serial) as Record<string, unknown> & { '@type': string[] }
    expect(json['@type']).toEqual(['Instance', 'Electronic'])
    expect(ids(json, 'issuance')).toEqual(['serl'])
    expect(ids(json, 'carrier')).toEqual(['cr'])

    const book = denormalize(made(serial, 'book')) as Record<string, unknown> & { '@type': string[] }
    expect(book['@type']).toEqual(['Instance', 'Print'])
    expect(ids(book, 'issuance')).toEqual([])
    expect(ids(book, 'carrier')).toEqual([])
  })

  it('leaves a carrier the cataloger chose', () => {
    const json = blankDescription(placeholderUri('1'))
    const withVolume = normalize({ ...json, carrier: [{ '@id': 'http://id.loc.gov/vocabulary/carriers/nc' }] })
    const online = denormalize(made(withVolume, 'book-online'))
    expect(ids(online, 'carrier')).toEqual(['nc', 'cr'])
    expect(resourceTypeOf(made(withVolume, 'book-online'))?.id).toBe('book')
  })
})

describe('what kind a new record looks like', () => {
  const book = blankDescription(placeholderUri('1')) as JsonObject & { instanceOf: JsonObject[] }
  const withContent = (code: string) =>
    normalize({
      ...book,
      instanceOf: [{ ...book.instanceOf[0], content: [{ '@id': `http://id.loc.gov/vocabulary/contentTypes/${code}` }] }],
    })

  it('goes by the content type', () => {
    expect(inferredKind(withContent('cri'))?.kind.id).toBe('map')
    expect(inferredKind(withContent('prm'))?.kind.id).toBe('music-recording')
    expect(inferredKind(withContent('ntm'))?.kind.id).toBe('score')
    expect(inferredKind(withContent('tdi'))?.kind.id).toBe('video')
    expect(inferredKind(withContent('cri'))?.because).toEqual([{ content: 'cri', label: 'cartographic image' }])
  })

  it('says nothing when the values fit the kind', () => {
    expect(inferredKind(withContent('txt'))).toBeUndefined()
    expect(inferredKind(normalize(book))).toBeUndefined()
  })

  it('goes by a field only one kind has', () => {
    const scaled = normalize({ ...book, scale: [{ '@type': ['Scale'], 'rdfs:label': ['1:24,000'] }] })
    expect(inferredKind(scaled)).toMatchObject({ kind: { id: 'map' }, because: [{ prop: 'scale' }] })
  })

  it('offers the online kind of an online record', () => {
    const monthly = normalize({
      ...book,
      frequency: [{ '@id': 'http://id.loc.gov/vocabulary/frequencies/mon' }],
      carrier: [{ '@id': 'http://id.loc.gov/vocabulary/carriers/cr' }],
    })
    expect(inferredKind(monthly)?.kind.id).toBe('serial-online')
  })

  it('stops once the record is that kind', () => {
    const map = withContent('cri')
    const change = kindChange(map, 'map')
    expect(change?.kind).toBe('map')
    expect(inferredKind(replay(map, change ? [change] : []))).toBeUndefined()
  })
})
