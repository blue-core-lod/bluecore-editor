import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

/**
 * A short tour of what makes the editor different, for someone's first visit
 * (and again from the "?" beside Hints). Each step points at the real
 * interface; a step whose part isn't on the page, such as the advice that only
 * a record of a known kind gets, is left out. The text is ours and fixed:
 * driver.js puts it into the page as HTML, so nothing from a record goes in.
 */

interface Step {
  /** Where on the page, as a CSS selector. */
  element: string
  title: string
  description: string
}

export const tourSteps: Step[] = [
  {
    element: '.title-block h1',
    title: 'One record',
    description:
      'A record is an Instance, the item in hand, and its Work. The page reads in cataloging order: title, contributors, subjects, publication, physical description.',
  },
  {
    element: '.resource-type',
    title: 'What kind of record',
    description:
      'Map, score, book: the kind decides which fields are offered first, from how LC describes that kind. A new record can change kind here.',
  },
  {
    element: '.usually',
    title: 'What records like this usually have',
    description: 'The fields most of LC’s records of this kind have and this one doesn’t, each a click from its field.',
  },
  {
    element: '.description .chip-name',
    title: 'Context for what you link to',
    description:
      'Choose a name, subject, place or term to see its context beside the record: LC’s authority record, Wikidata, Wikipedia, and how Blue Core uses it.',
  },
  {
    element: '#add-field',
    title: 'Any field, by name or MARC tag',
    description: 'Search every BIBFRAME property by name, or by the MARC tag you know: “490” finds the series statement.',
  },
  {
    element: '.hints-control',
    title: 'Hints',
    description:
      'Show each field’s MARC tag and BIBFRAME property, and whether it’s saved with the Work or the Instance. The “?” explains, and offers this tour again.',
  },
  {
    element: '.views',
    title: 'Graph and JSON',
    description: 'See the record as a graph of what it links to, or as the bibframe-json Blue Core stores.',
  },
  {
    element: '[data-tour="changes"]',
    title: 'Every change, undoable',
    description:
      'Each edit is listed here and can be undone on its own. Unsaved changes are kept in this browser until you save to Blue Core.',
  },
]

/** The steps whose part of the page is there to point at. */
export function presentSteps(steps: readonly Step[], find: (selector: string) => Element | null): DriveStep[] {
  return steps.flatMap((step) =>
    find(step.element)
      ? [{ element: step.element, popover: { title: step.title, description: step.description } }]
      : [],
  )
}

/** Run the tour, calling done when it ends, however it ends. */
export function startTour(done: () => void): void {
  const steps = presentSteps(tourSteps, (selector) => document.querySelector(selector))
  if (steps.length === 0) {
    done()
    return
  }
  const tour = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'tour-popover',
    stagePadding: 6,
    onDestroyed: done,
  })
  tour.drive()
}
