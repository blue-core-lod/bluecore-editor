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
  /** The id.loc.gov directory to browse for input shaped like a heading (see browse.ts). */
  browse?: string
}

/** An LC vocabulary vendored into the editor (see scripts/vendor-lc-vocabularies.mjs). */
export interface VocabularySource {
  label: string
  vocabulary: Vocabulary
}

/** Headings browsed at id.loc.gov whatever is typed, as the parts of a complex subject are. */
export interface BrowseSource {
  label: string
  /** The id.loc.gov directory, such as "subjects". */
  browse: string
  /** One of LC's collections, such as its geographic subdivisions. */
  memberOf?: string
}

export type Source = QaSource | VocabularySource | BrowseSource

export function isLocal(source: Source): source is VocabularySource {
  return 'vocabulary' in source
}

export function isBrowse(source: Source): source is BrowseSource {
  return 'browse' in source && !('path' in source)
}

const lcNames: QaSource = { label: 'LC Names', path: 'loc/names', browse: 'names' }
const lcsh: QaSource = { label: 'LC Subjects', path: 'loc/subjects', browse: 'subjects' }

export const lookups: Record<string, Source[]> = {
  agent: [lcNames],
  subject: [lcsh, lcNames],
  genreForm: [{ label: 'LC Genre/Form', path: 'loc/genreForms', browse: 'genreForms' }],
  carrier: [{ label: 'LC Carrier types', vocabulary: 'carriers' }],
  media: [{ label: 'LC Media types', vocabulary: 'mediaTypes' }],
  content: [{ label: 'LC Content types', vocabulary: 'contentTypes' }],
  language: [{ label: 'LC Languages', vocabulary: 'languages' }],
  role: [{ label: 'LC Relators', vocabulary: 'relators' }],
  place: [{ label: 'MARC Countries', vocabulary: 'countries' }],
  issuance: [{ label: 'LC Issuance', vocabulary: 'issuance' }],
}

/**
 * Composing a complex subject: the first part is a subject or a name, and
 * each part after it a subdivision, from LC's collections of them. The
 * established headings that begin with the whole of what's typed are offered
 * too, so a heading LC already has is linked whole.
 */
const subdivision = (label: string, collection: string, browse = 'subjects'): BrowseSource => ({
  label,
  browse,
  memberOf: `http://id.loc.gov/authorities/subjects/${collection}`,
})

export const composing = {
  first: [
    { label: 'LC Subjects', browse: 'subjects' },
    { label: 'LC Names', browse: 'names' },
  ] satisfies BrowseSource[],
  subdivisions: [
    subdivision('Topical', 'collection_TopicSubdivisions'),
    // Countries, states and cities are name authorities; their subdivision forms ("Germany", n80125931-781) are in LC Names.
    subdivision('Geographic (NAF)', 'collection_GeographicSubdivisions', 'names'),
    subdivision('Geographic (LCSH)', 'collection_GeographicSubdivisions'),
    subdivision('Form', 'collection_GenreFormSubdivisions'),
    subdivision('Chronological', 'collection_TemporalSubdivisions'),
  ],
  whole: { label: 'Whole headings', browse: 'subjects' } satisfies BrowseSource,
}

/** Properties whose headings can be composed from parts. */
export function composes(prop: string): boolean {
  return prop === 'subject'
}

const none: Source[] = []

/** The sources for a property, the same array each time, so a lookup doesn't search again on every render. */
export function sourcesFor(prop: string): Source[] {
  return lookups[prop] ?? none
}
