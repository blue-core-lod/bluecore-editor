import { describe, expect, it } from 'vitest'

import { presentSteps, tourSteps } from '../src/ui/tour'

describe('the first-visit tour', () => {
  it('points only at what’s on the page', () => {
    const onPage = new Set(['.title-block h1', '#add-field'])
    const steps = presentSteps(tourSteps, (selector) => (onPage.has(selector) ? ({} as Element) : null))
    expect(steps.map((step) => step.element)).toEqual(['.title-block h1', '#add-field'])
    expect(steps[0]?.popover?.title).toBe('One record')
  })

  it('stays short enough to be read', () => {
    expect(tourSteps.length).toBeLessThanOrEqual(8)
  })
})
