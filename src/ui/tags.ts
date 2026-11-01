import { termLabel } from './labels'
import { identifierMarc, provisionMarc, sections, type ResourceKind } from './presentation'

/**
 * MARC tag search (design.md, The MARC bridge): typing "490" in Add field
 * offers the series statement, "650" subjects. Each tag a cataloger knows
 * leads to the BIBFRAME property LC's MARC to BIBFRAME conversion puts it in,
 * and, where the tag says which kind of node, that kind ("020" adds an ISBN,
 * "246" a variant title). Approximate where the conversion splits a field
 * across several properties: the aim is to get a cataloger to the right
 * field, not to reproduce the conversion.
 */

export interface TagEntry {
  /** "650", or "300 $b" for a subfield, as the hints write it. */
  tag: string
  /** What MARC calls it. */
  name: string
  prop: string
  /** The kind of node to add, where the tag says. */
  type?: string
  /** The resource it goes on, where the tag decides (245 the Instance's title, 240 the Work's). */
  on?: ResourceKind
}

const curated: TagEntry[] = [
  { tag: '130', name: 'Main entry, uniform title', prop: 'title', type: 'Title', on: 'Work' },
  { tag: '210', name: 'Abbreviated title', prop: 'title', type: 'AbbreviatedTitle', on: 'Instance' },
  { tag: '222', name: 'Key title', prop: 'title', type: 'KeyTitle', on: 'Instance' },
  { tag: '246', name: 'Varying form of title', prop: 'title', type: 'VariantTitle', on: 'Instance' },

  { tag: '100', name: 'Main entry, personal name', prop: 'contribution', type: 'PrimaryContribution', on: 'Work' },
  { tag: '110', name: 'Main entry, corporate name', prop: 'contribution', type: 'PrimaryContribution', on: 'Work' },
  { tag: '111', name: 'Main entry, meeting name', prop: 'contribution', type: 'PrimaryContribution', on: 'Work' },
  { tag: '700', name: 'Added entry, personal name', prop: 'contribution', type: 'Contribution', on: 'Work' },
  { tag: '710', name: 'Added entry, corporate name', prop: 'contribution', type: 'Contribution', on: 'Work' },
  { tag: '711', name: 'Added entry, meeting name', prop: 'contribution', type: 'Contribution', on: 'Work' },

  { tag: '600', name: 'Subject, personal name', prop: 'subject' },
  { tag: '610', name: 'Subject, corporate name', prop: 'subject' },
  { tag: '611', name: 'Subject, meeting name', prop: 'subject' },
  { tag: '630', name: 'Subject, uniform title', prop: 'subject' },
  { tag: '648', name: 'Subject, chronological term', prop: 'subject' },
  { tag: '651', name: 'Subject, geographic name', prop: 'subject' },
  { tag: '043', name: 'Geographic area code', prop: 'geographicCoverage' },
  { tag: '045', name: 'Time period of content', prop: 'temporalCoverage' },
  { tag: '060', name: 'NLM call number', prop: 'classification', type: 'ClassificationNlm' },
  { tag: '082', name: 'Dewey Decimal classification number', prop: 'classification', type: 'ClassificationDdc' },
  { tag: '084', name: 'Other classification number', prop: 'classification', type: 'Classification' },

  {
    tag: '260',
    name: 'Publication, distribution, etc. (imprint)',
    prop: 'provisionActivity',
    type: 'Publication',
    on: 'Instance',
  },
  { tag: '490 $v', name: 'Series statement, volume', prop: 'seriesEnumeration' },
  { tag: '800', name: 'Series added entry, personal name', prop: 'hasSeries' },
  { tag: '810', name: 'Series added entry, corporate name', prop: 'hasSeries' },
  { tag: '811', name: 'Series added entry, meeting name', prop: 'hasSeries' },
  { tag: '830', name: 'Series added entry, uniform title', prop: 'hasSeries' },

  { tag: '255 $a', name: 'Cartographic mathematical data, scale', prop: 'scale' },
  { tag: '255 $b', name: 'Cartographic mathematical data, projection', prop: 'projection' },
  { tag: '255 $c', name: 'Cartographic mathematical data, coordinates', prop: 'cartographicAttributes' },
  { tag: '300 $e', name: 'Accompanying material', prop: 'supplementaryContent' },
  { tag: '306', name: 'Playing time', prop: 'duration' },
  { tag: '310', name: 'Current publication frequency', prop: 'frequency' },
  { tag: '340', name: 'Physical medium', prop: 'baseMaterial' },
  { tag: '344', name: 'Sound characteristics', prop: 'soundCharacteristic' },
  { tag: '346', name: 'Video characteristics', prop: 'videoCharacteristic' },
  { tag: '347', name: 'Digital file characteristics', prop: 'digitalCharacteristic' },
  { tag: '348', name: 'Format of notated music', prop: 'musicFormat' },
  { tag: '362', name: 'Dates of publication and sequential designation', prop: 'firstIssue' },
  { tag: '382', name: 'Medium of performance', prop: 'musicMedium' },
  { tag: '383 $b', name: 'Opus number', prop: 'musicOpusNumber' },
  { tag: '383 $c', name: 'Thematic index number', prop: 'musicThematicNumber' },
  { tag: '384', name: 'Key', prop: 'musicKey' },

  { tag: '502', name: 'Dissertation note', prop: 'dissertation' },
  { tag: '506', name: 'Restrictions on access note', prop: 'usageAndAccessPolicy' },
  { tag: '508', name: 'Creation/production credits note', prop: 'credits' },
  { tag: '521', name: 'Target audience note', prop: 'intendedAudience' },
  { tag: '538', name: 'System details note', prop: 'systemRequirement' },
  { tag: '540', name: 'Terms governing use and reproduction note', prop: 'usageAndAccessPolicy' },
  { tag: '541', name: 'Immediate source of acquisition note', prop: 'acquisitionSource' },
  { tag: '561', name: 'Ownership and custodial history', prop: 'custodialHistory' },
  { tag: '586', name: 'Awards note', prop: 'awards' },
  { tag: '856', name: 'Electronic location and access', prop: 'electronicLocator' },

  { tag: '765', name: 'Original language entry', prop: 'translationOf' },
  { tag: '767', name: 'Translation entry', prop: 'translation' },
  { tag: '770', name: 'Supplement/special issue entry', prop: 'supplement' },
  { tag: '772', name: 'Supplement parent entry', prop: 'supplementTo' },
  { tag: '773', name: 'Host item entry', prop: 'partOf' },
  { tag: '774', name: 'Constituent unit entry', prop: 'hasPart' },
  { tag: '776', name: 'Additional physical form entry', prop: 'otherPhysicalFormat' },
  { tag: '780', name: 'Preceding entry', prop: 'precededBy' },
  { tag: '785', name: 'Succeeding entry', prop: 'succeededBy' },
  { tag: '787', name: 'Other relationship entry', prop: 'relatedTo' },
]

/** The sidecar's own tags, so a field and its tag search agree; the curated entries add what it doesn't name. */
const fromSidecar: TagEntry[] = sections.flatMap((section) =>
  section.fields.flatMap((field) =>
    field.marc ? [{ tag: field.marc, name: field.label, prop: field.prop, ...(field.on ? { on: field.on } : {}) }] : [],
  ),
)

/** Identifiers and publication details are the Instance's, as MARC's 020 and 264 are the manifestation's. */
const identifiers: TagEntry[] = Object.entries(identifierMarc).map(([type, tag]) => ({
  tag,
  name: termLabel(type),
  prop: 'identifiedBy',
  type,
  on: 'Instance' as const,
}))

const provisions: TagEntry[] = Object.entries(provisionMarc).map(([type, tag]) => ({
  tag,
  name: termLabel(type),
  prop: 'provisionActivity',
  type,
  on: 'Instance' as const,
}))

export const tagEntries: TagEntry[] = [...fromSidecar, ...identifiers, ...provisions, ...curated].toSorted((a, b) =>
  a.tag.localeCompare(b.tag),
)

/** Whether a search looks like a MARC tag: it starts with a digit. */
export function isTagQuery(query: string): boolean {
  return /^\d/.test(query.trim())
}

/** The entries whose tag starts with the query, in tag order: "65" finds 650, 651 and 655. */
export function tagMatches(query: string): TagEntry[] {
  const text = query.trim().replace(/\s+/g, ' ')
  return tagEntries.filter((entry) => entry.tag.startsWith(text))
}
