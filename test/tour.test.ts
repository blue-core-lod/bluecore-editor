import { describe, expect, it } from 'vitest'

import { editorTour, homeTour, presentSteps } from '../src/ui/tour'

describe('the first-visit tour', () => {
  it('points only at what’s on the page', () => {
    const onPage = new Set(['.title-block h1', '#add-field'])
    const steps = presentSteps(editorTour, (selector) => (onPage.has(selector) ? ({} as Element) : null))
    expect(steps.map((step) => step.element)).toEqual(['.title-block h1', '#add-field'])
    expect(steps[0]?.title).toBe('One record')
  })

  it('offers the context panel where there’s an entity to open it for', () => {
    const find = (onPage: string[]) => (selector: string) => (onPage.includes(selector) ? ({} as Element) : null)
    const withChip = presentSteps(editorTour, find(['.description .chip-name'])).map((step) => step.element)
    expect(withChip).toEqual(['.description .chip-name', '.context-panel'])
    expect(presentSteps(editorTour, find([])).map((step) => step.element)).toEqual([])
  })

  it('stays short enough to be read', () => {
    expect(editorTour.length).toBeLessThanOrEqual(9)
    expect(homeTour.length).toBeLessThanOrEqual(4)
    expect(homeTour.at(-1)?.title).toBe('Next, the editor')
  })
})
