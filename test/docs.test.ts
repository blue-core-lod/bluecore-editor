import { afterEach, describe, expect, it, vi } from 'vitest'

import { profileUrl, whichFieldsUrl } from '../src/ui/docs'

describe('links to the docs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('goes to main from a dev build, which has no commit to pin to', () => {
    expect(profileUrl('map')).toBe('https://github.com/edsu/bluecore-editor/blob/main/docs/profiles/map.md')
    expect(whichFieldsUrl).toBe('https://github.com/edsu/bluecore-editor/blob/main/docs/which-fields.md')
  })

  it('goes to the commit a deployed build was made from', async () => {
    vi.stubEnv('VITE_VERSION', '0d11966')
    vi.resetModules()
    const docs = await import('../src/ui/docs')
    expect(docs.profileUrl('map')).toBe('https://github.com/edsu/bluecore-editor/blob/0d11966/docs/profiles/map.md')
  })
})
