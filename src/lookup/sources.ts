import type { Vocabulary } from './local'

/**
 * Where to look up a linked value, by the property it's for. Authorities are
 * searched in QA (Questioning Authority), the lookup service Sinopia uses, so
 * a cataloger finds the same entities in either editor. The small LC
 * vocabularies (carriers, languages, relators…) are vendored picklists.
 */

/** An authority searched in QA. */
export interface QaSource {
  /** What the cataloger sees, such as "LC Names". */
  label: string
  /** The QA search path, after authorities/search/. */
  path: string
}

/** An LC vocabulary vendored into the editor (see scripts/vendor-lc-vocabularies.mjs). */
export interface VocabularySource {
  label: string
  vocabulary: Vocabulary
}

export type Source = QaSource | VocabularySource

export function isLocal(source: Source): source is VocabularySource {
  return 'vocabulary' in source
}

const lcNames: QaSource = { label: 'LC Names', path: 'loc/names' }
const lcsh: QaSource = { label: 'LC Subjects', path: 'loc/subjects' }

export const lookups: Record<string, Source[]> = {
  agent: [lcNames],
  subject: [lcsh, lcNames],
  genreForm: [{ label: 'LC Genre/Form', path: 'loc/genreForms' }],
  carrier: [{ label: 'LC Carrier types', vocabulary: 'carriers' }],
  media: [{ label: 'LC Media types', vocabulary: 'mediaTypes' }],
  content: [{ label: 'LC Content types', vocabulary: 'contentTypes' }],
  language: [{ label: 'LC Languages', vocabulary: 'languages' }],
  role: [{ label: 'LC Relators', vocabulary: 'relators' }],
  place: [{ label: 'MARC Countries', vocabulary: 'countries' }],
  issuance: [{ label: 'LC Issuance', vocabulary: 'issuance' }],
}

const none: Source[] = []

/** The sources for a property, the same array each time, so a lookup doesn't search again on every render. */
export function sourcesFor(prop: string): Source[] {
  return lookups[prop] ?? none
}
