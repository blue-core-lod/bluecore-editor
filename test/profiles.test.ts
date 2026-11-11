import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { renderProfiles } from '../scripts/profiles'

describe('the field profiles in docs/profiles', () => {
  it.each(Object.entries(renderProfiles()))('%s is current: run npm run profiles', (name, text) => {
    expect(readFileSync(join(__dirname, '..', 'docs', 'profiles', name), 'utf8')).toBe(text)
  })
})
