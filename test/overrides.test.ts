import { describe, expect, it, vi } from 'vitest'

import { guidedProperties, usage } from '../src/schema/guidance'
import { renderProfiles } from '../scripts/profiles'

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

describe('an override in the field profiles', () => {
  const profiles = renderProfiles()

  it('is listed with its share, both tiers and its reason', () => {
    expect(profiles['music-recording.md']).toContain('| `bf:duration` | 22% | Suggested | Shown | Catalogers expect it. |')
    expect(profiles['map.md']).toContain(
      '| `bflc:governmentPubType` | 22% | Suggested | Available | A MARC fixed field, not a choice. |',
    )
  })

  it('marks the field it moved', () => {
    expect(profiles['music-recording.md']).toMatch(/\| Duration \| `bf:duration` \|.*\| Shown \(override\) \|/)
    expect(profiles['map.md']).toContain('`bflc:governmentPubType` 22% (override)')
  })

  it('says when a kind has none', () => {
    expect(profiles['book.md']).toContain('None: every tier here comes from the measured share.')
  })
})
