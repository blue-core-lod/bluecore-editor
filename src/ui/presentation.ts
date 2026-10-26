/**
 * The presentation sidecar: how the description view groups and orders
 * properties, and their MARC hints. It is keyed by property name, which is
 * stable across bibframe-json versions, and kept apart from the schema so the
 * schema stays clean for other consumers (design.md, Appendix A).
 *
 * The guidance tiers (shown, suggested, available) will come from LC's data;
 * for now every property a description has is shown, in these sections first
 * and in "Other fields" if no section claims it.
 */

export type ResourceKind = 'Instance' | 'Work'

export interface FieldSpec {
  prop: string
  /** Only where this resource has it; otherwise wherever it is found. */
  on?: ResourceKind
  /** Where a new value goes, if the field isn't there yet; defaults to `on`, then to the ontology's domain. */
  home?: ResourceKind
  label: string
  /** The MARC field it corresponds to, such as "245" or "300 $a". */
  marc?: string
  /** One row per value, labelled by the value itself (each contributor by role, each identifier by type). */
  perValue?: 'contribution' | 'identifier' | 'provision'
}

export interface SectionSpec {
  title: string
  fields: FieldSpec[]
}

/** In ISBD and RDA order, named in cataloging terms (mockups/screens.md). */
export const sections: SectionSpec[] = [
  {
    title: 'Title and statement of responsibility',
    fields: [
      { prop: 'title', on: 'Instance', label: 'Title', marc: '245' },
      { prop: 'responsibilityStatement', home: 'Instance', label: 'Statement of responsibility', marc: '245 $c' },
      { prop: 'title', on: 'Work', label: 'Preferred title', marc: '240' },
      { prop: 'editionStatement', home: 'Instance', label: 'Edition', marc: '250' },
    ],
  },
  {
    title: 'Creators and contributors',
    fields: [{ prop: 'contribution', home: 'Work', label: 'Contributor', perValue: 'contribution' }],
  },
  {
    title: 'Subjects and genre/form',
    fields: [
      { prop: 'subject', home: 'Work', label: 'Subjects', marc: '650' },
      { prop: 'genreForm', home: 'Work', label: 'Genre/form', marc: '655' },
      { prop: 'classification', home: 'Work', label: 'Classification', marc: '050' },
    ],
  },
  {
    title: 'Publication and identifiers',
    fields: [
      { prop: 'provisionActivity', home: 'Instance', label: 'Publication', perValue: 'provision' },
      { prop: 'publicationStatement', home: 'Instance', label: 'Publication statement', marc: '264' },
      { prop: 'copyrightDate', home: 'Instance', label: 'Copyright date', marc: '264 _4' },
      { prop: 'seriesStatement', home: 'Instance', label: 'Series statement', marc: '490' },
      { prop: 'identifiedBy', home: 'Instance', label: 'Identifier', perValue: 'identifier' },
    ],
  },
  {
    title: 'Physical description and carrier',
    fields: [
      { prop: 'content', home: 'Work', label: 'Content', marc: '336' },
      { prop: 'media', label: 'Media', marc: '337' },
      { prop: 'carrier', label: 'Carrier', marc: '338' },
      { prop: 'extent', home: 'Instance', label: 'Extent', marc: '300 $a' },
      { prop: 'illustrativeContent', home: 'Instance', label: 'Illustrative content', marc: '300 $b' },
      { prop: 'dimensions', home: 'Instance', label: 'Dimensions', marc: '300 $c' },
    ],
  },
  {
    title: 'Language and notes',
    fields: [
      { prop: 'language', home: 'Work', label: 'Language', marc: '041' },
      { prop: 'note', home: 'Instance', label: 'Note', marc: '500' },
      { prop: 'summary', home: 'Work', label: 'Summary', marc: '520' },
      { prop: 'tableOfContents', home: 'Instance', label: 'Contents', marc: '505' },
    ],
  },
]

/** Kept out of the sections: the links between the two resources, and record metadata. */
export const structural: Record<ResourceKind, string[]> = {
  Instance: ['instanceOf'],
  Work: ['hasInstance'],
}
export const recordProps = ['adminMetadata']

/**
 * Properties that take a link, where neither linked.json nor the ontology's
 * ranges say what a property takes. Anything else is assumed to be text.
 */
export const linkedProperties = new Set([
  'agent',
  'carrier',
  'content',
  'genreForm',
  'language',
  'media',
  'place',
  'role',
  'subject',
  'source',
  'status',
])

/**
 * Classes whose nodes are described in place, by a label, rather than linked:
 * an Extent is "xii, 355 pages", not a URI. Adding one asks for its label.
 */
export const describedInPlace = new Set(['Extent', 'Note', 'Summary', 'TableOfContents', 'Illustration'])

/** MARC fields for the per-value rows, by the value's @type. */
export const identifierMarc: Record<string, string> = {
  Isbn: '020',
  Lccn: '010',
  Issn: '022',
  Ean: '024 3_',
  Upc: '024 1_',
  Ismn: '024 2_',
  Local: '035',
  OclcNumber: '035',
}

export const provisionMarc: Record<string, string> = {
  Production: '264 _0',
  Publication: '264 _1',
  Distribution: '264 _2',
  Manufacture: '264 _3',
}

/** MARC 21 bibliographic format pages for each three-digit tag in a hint. */
export function marcLinks(marc: string): { tag: string; href: string }[] {
  return [...marc.matchAll(/\b\d{3}\b/g)].map(([tag]) => ({
    tag,
    href: `https://www.loc.gov/marc/bibliographic/bd${tag}.html`,
  }))
}

export const primerUrl = 'https://bibframe.org/docs/view/documentation-bf-primer/index.md'
