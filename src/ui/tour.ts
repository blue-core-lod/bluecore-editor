import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

/**
 * Short tours for someone's first visit: one of the start page, one of the
 * editor (again from the "?" beside Hints). Each step points at the real
 * interface; a step whose part isn't on the page, such as the advice that only
 * a record of a known kind gets, is left out. A step can make its part appear
 * first: the context panel step opens the panel for the record's first entity.
 * The text is ours and fixed: driver.js puts it into the page as HTML, so
 * nothing from a record goes in.
 */

export interface Step {
  /** Where on the page, as a CSS selector. */
  element: string
  /** What must be on the page for the step to be offered, if not the element itself (one that `prepare` makes appear). */
  requires?: string
  /** Done just before the step is shown, to make its element appear. */
  prepare?: () => void
  /** On the last step: what its button says and does instead of just ending the tour. */
  finish?: { label: string; then: () => void }
  title: string
  description: string
}

/** The start page's tour; its last step carries on into the editor on a new record. */
export const homeTour = (startNew: () => void): Step[] => [
  {
    element: '.start form',
    title: 'Open a record',
    description:
      'Search Blue Core’s Instances by title, name or identifier, or paste an Instance’s URI. Each record opens as an Instance with its Work.',
  },
  {
    element: '.start-new',
    title: 'Or start a new one',
    description:
      'A new record starts as a book; you can make it a map, a score or a recording, and the editor suggests a kind from what you enter.',
  },
  {
    element: '.drafts',
    title: 'Unsaved records',
    description: 'Changes you haven’t saved to Blue Core are kept in this browser, and listed here until you save or discard them.',
  },
  {
    element: '.start-heading',
    title: 'Next, the editor',
    description:
      'Open a record, from a search or a new one, and the tour carries on there, or try it now on a new record. You can take it again any time from the “?” beside Hints.',
    finish: { label: 'Try it on a new record', then: startNew },
  },
]

export const editorTour: Step[] = [
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
    description: 'Names, subjects, places and terms are links. Choose one to see what the sources say about it. Next opens one.',
  },
  {
    element: '.context-panel',
    requires: '.description .chip-name',
    prepare: () => document.querySelector<HTMLElement>('.description .chip-name')?.click(),
    title: 'The evidence, beside the record',
    description:
      'LC’s authority record with its variants and sources, Wikidata, Wikipedia, and how Blue Core already uses it, so you can tell whether you picked the right one without leaving the record.',
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

/** The steps whose part of the page is there to point at, or will be once prepared. */
export function presentSteps(steps: readonly Step[], find: (selector: string) => Element | null): Step[] {
  return steps.filter((step) => find(step.requires ?? step.element))
}

/** Resolves once something matches the selector, or after a second and a half if nothing does. */
function appeared(selector: string): Promise<void> {
  const until = performance.now() + 1500
  return new Promise((resolve) => {
    const look = () => {
      if (document.querySelector(selector) || performance.now() > until) requestAnimationFrame(() => resolve())
      else requestAnimationFrame(look)
    }
    look()
  })
}

/** Run a tour, calling done when it ends, however it ends. */
export function startTour(tourSteps: readonly Step[], done: () => void): void {
  const present = presentSteps(tourSteps, (selector) => document.querySelector(selector))
  if (present.length === 0) {
    done()
    return
  }
  const steps: DriveStep[] = present.map((step) => ({
    element: step.element,
    popover: {
      title: step.title,
      description: step.description,
      ...(step.finish ? { doneBtnText: step.finish.label } : {}),
    },
  }))
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
    // A step that makes its own element appear is shown once it has.
    onNextClick: () => {
      const next = present[(tour.getActiveIndex() ?? 0) + 1]
      if (!next) {
        tour.destroy()
        present.at(-1)?.finish?.then()
        return
      }
      if (!next.prepare) {
        tour.moveNext()
        return
      }
      next.prepare()
      void appeared(next.element).then(() => tour.moveNext())
    },
  })
  tour.drive()
}
