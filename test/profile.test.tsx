import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Fields } from '../src/ui/Fields'
import { profileOf, propertyName } from '../src/ui/profile'

const fields = (id: string) => profileOf(id)?.sections.flatMap((section) => section.fields) ?? []

describe('the field profile of a kind', () => {
  it('lists what a new record of the kind offers, by section, with shares and tiers', () => {
    const map = profileOf('map')
    expect(map?.records).toBe(500)
    expect(map?.sections.map((section) => section.title)).toContain('Map details')
    expect(fields('map').find((field) => field.prop === 'scale')).toMatchObject({ tier: 'shown', resource: 'Work' })
    expect(fields('map').find((field) => field.prop === 'cartographicAttributes')).toMatchObject({ tier: 'suggested' })
  })

  it('lists the fields that choosing the kind fills in', () => {
    expect(fields('book-online').find((field) => field.prop === 'carrier')).toMatchObject({ setByKind: true, tier: 'shown' })
    expect(fields('serial').find((field) => field.prop === 'issuance')).toMatchObject({ setByKind: true })
    expect(fields('map').find((field) => field.prop === 'carrier')).toMatchObject({ setByKind: false })
  })

  it('says what defines the kind and what a new record of it holds', () => {
    expect(profileOf('serial-online')?.definedBy).toEqual({ work: ['Serial'], issuance: ['serl'], online: true, afterOthers: false })
    expect(profileOf('map')?.holds).toEqual([
      { resource: 'Instance', what: 'type', value: 'Print' },
      { resource: 'Work', what: 'type', value: 'Cartography' },
    ])
    expect(profileOf('book')?.startsAs).toBe(true)
    expect(profileOf('map')?.startsAs).toBe(false)
  })

  it('gives the kinds of typed values, but not a class that only repeats the property', () => {
    expect(fields('map').find((field) => field.prop === 'identifiedBy')?.typed[0]?.cls).toBe('Lccn')
    expect(fields('map').find((field) => field.prop === 'extent')?.typed).toEqual([])
  })

  it('keeps record-keeping out, and the rare properties for Add field', () => {
    expect(fields('map').map((field) => field.prop)).not.toContain('adminMetadata')
    expect(profileOf('map')?.available.every(({ share }) => share < 0.1)).toBe(true)
  })

  it('knows nothing of a kind the rules don’t', () => {
    expect(profileOf('atlas')).toBeUndefined()
  })

  it('names properties as they’re looked up', () => {
    expect(propertyName('scale')).toBe('bf:scale')
    expect(propertyName('bflc:governmentPubType')).toBe('bflc:governmentPubType')
    expect(propertyName('http://purl.org/dc/terms/isPartOf')).toBe('dcterms:isPartOf')
  })
})

/** The page's text and markup, rendered into the test document. */
function rendered(kind: string): string {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<Fields kind={kind} />))
  const html = container.innerHTML
  act(() => root.unmount())
  return html
}

describe('the Fields page', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver, which the header uses to measure itself.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  })

  it('shows a kind’s profile', () => {
    const html = rendered('map')
    expect(html).toContain('Fields for maps')
    expect(html).toContain('<code>bf:scale</code>')
    expect(html).toContain('None: every tier here comes from the measured share.')
  })

  it('lists the kinds, and says so when it doesn’t know one', () => {
    expect(rendered('')).toContain('Fields by kind of record')
    expect(rendered('atlas')).toContain('There’s no kind of record called “atlas”.')
  })
})
