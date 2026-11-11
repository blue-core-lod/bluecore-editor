import { describe, expect, it, vi } from 'vitest'

import { checkedOverrides, guidedProperties, usage } from '../src/schema/guidance'
import { profileOf } from '../src/ui/profile'

// The overrides file has no per-kind entries yet, so these stand in for some.
vi.mock('../src/schema/guidance-overrides.json', () => ({
  default: {
    thresholds: { shown: 0.5, suggested: 0.1 },
    never: ['adminMetadata', 'instanceOf', 'hasInstance'],
    types: {
      'music-recording': [{ prop: 'duration', tier: 'shown', reason: 'Catalogers expect it.' }],
      map: [{ prop: 'bflc:governmentPubType', tier: 'available', reason: 'A MARC fixed field, not a choice.' }],
    },
  },
}))

describe('an override', () => {
  it('puts a property in its tier, saying what its share alone gives and why', () => {
    expect(usage('music-recording', 'duration')).toMatchObject({
      tier: 'shown',
      override: { measured: 'suggested', reason: 'Catalogers expect it.' },
    })
    expect(usage('map', 'bflc:governmentPubType')).toMatchObject({ tier: 'available', override: { measured: 'suggested' } })
  })

  it('leaves the other kinds and properties to their shares', () => {
    expect(usage('book', 'duration')?.override).toBeUndefined()
    expect(usage('map', 'scale')).toMatchObject({ tier: 'shown' })
    expect(usage('map', 'scale')?.override).toBeUndefined()
  })

  it('takes a demoted property out of what the sections offer', () => {
    expect(guidedProperties('map').map(({ prop }) => prop)).not.toContain('bflc:governmentPubType')
  })
})

describe('an override in a field profile', () => {
  const fields = (id: string) => profileOf(id)?.sections.flatMap((section) => section.fields) ?? []

  it('is listed with its share, both tiers and its reason', () => {
    expect(profileOf('music-recording')?.overrides).toEqual([
      { prop: 'duration', share: expect.closeTo(0.22, 2), measured: 'suggested', tier: 'shown', reason: 'Catalogers expect it.' },
    ])
    expect(profileOf('map')?.overrides).toMatchObject([{ prop: 'bflc:governmentPubType', measured: 'suggested', tier: 'available' }])
  })

  it('marks the field it moved', () => {
    expect(fields('music-recording').find((field) => field.prop === 'duration')).toMatchObject({
      tier: 'shown',
      override: { measured: 'suggested' },
    })
    expect(fields('map').map((field) => field.prop)).not.toContain('bflc:governmentPubType')
    expect(profileOf('map')?.available).toContainEqual(expect.objectContaining({ prop: 'bflc:governmentPubType', override: true }))
  })

  it('leaves a kind with none empty', () => {
    expect(profileOf('book')?.overrides).toEqual([])
  })
})

describe('checking the overrides file', () => {
  const never = new Set(['adminMetadata'])
  const check = (types: unknown) => () => checkedOverrides(types, never)

  it('takes a list of overrides per kind', () => {
    expect(check({ map: [{ prop: 'scale', tier: 'shown', reason: 'Why not.' }] })()).toHaveProperty('map')
    expect(check({})()).toEqual({})
  })

  it('refuses the per-tier lists it used to hold', () => {
    expect(check({ map: { available: ['bflc:governmentPubType'] } })).toThrow(/list/)
  })

  it('refuses an unknown tier, a missing reason, a kind it doesn’t know and a property no form offers', () => {
    expect(check({ map: [{ prop: 'scale', tier: 'show', reason: 'x' }] })).toThrow(/tier/)
    expect(check({ map: [{ prop: 'scale', tier: 'shown' }] })).toThrow(/reason/)
    expect(check({ atlas: [] })).toThrow(/not a kind/)
    expect(check({ book: [{ prop: 'adminMetadata', tier: 'shown', reason: 'x' }] })).toThrow(/never/)
  })
})
