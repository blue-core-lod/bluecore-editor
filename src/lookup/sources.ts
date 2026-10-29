/**
 * Where to look up a linked value, by the property it's for. These are QA
 * (Questioning Authority) authorities, the lookup service Sinopia uses, so a
 * cataloger finds the same entities in either editor.
 *
 * The LC vocabularies (carriers, languages, relators…) are small enough to be
 * local picklists one day, as the design says; until then they're lookups too.
 */

export interface Source {
  /** What the cataloger sees, such as "LC Names". */
  label: string
  /** The QA search path, after authorities/search/. */
  path: string
}

const lcNames: Source = { label: 'LC Names', path: 'loc/names' }
const lcsh: Source = { label: 'LC Subjects', path: 'loc/subjects' }

export const lookups: Record<string, Source[]> = {
  agent: [lcNames],
  subject: [lcsh, lcNames],
  genreForm: [{ label: 'LC Genre/Form', path: 'loc/genreForms' }],
  carrier: [{ label: 'LC Carrier types', path: 'loc/carriers' }],
  media: [{ label: 'LC Media types', path: 'loc/mediaTypes' }],
  content: [{ label: 'LC Content types', path: 'loc/contentTypes' }],
  language: [{ label: 'LC Languages', path: 'loc/languages' }],
  role: [{ label: 'LC Relators', path: 'loc/relators' }],
  place: [{ label: 'MARC Countries', path: 'loc/countries' }],
  issuance: [{ label: 'LC Issuance', path: 'loc/issuance' }],
}

const none: Source[] = []

/** The sources for a property, the same array each time, so a lookup doesn't search again on every render. */
export function sourcesFor(prop: string): Source[] {
  return lookups[prop] ?? none
}
