import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { renderProfiles } from '../scripts/profiles'

const dir = join(__dirname, '..', 'docs', 'profiles')
const profiles = renderProfiles()

describe('the field profiles in docs/profiles', () => {
  it.each(Object.entries(profiles))('%s is current: run npm run profiles', (name, text) => {
    expect(readFileSync(join(dir, name), 'utf8')).toBe(text)
  })

  it('has no profile of a kind that is gone: run npm run profiles', () => {
    expect(readdirSync(dir).toSorted()).toEqual(Object.keys(profiles).toSorted())
  })

  it('lists the fields that choosing a kind fills in', () => {
    expect(profiles['book-online.md']).toMatch(/\| Carrier \| `bf:carrier` \|.*\| Shown, set by the kind \|/)
    expect(profiles['serial.md']).toMatch(/\| Mode of issuance \| `bf:issuance` \|.*\| Shown, set by the kind \|/)
  })
})
