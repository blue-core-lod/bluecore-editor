import type { Json, JsonObject } from '../doc/model'

/**
 * Transcribing from photos of the item, the first pilot in
 * docs/proposals/assistance.md: what a model is asked to read off the title
 * page, verso and CIP block, and how what it reads compares with the record a
 * cataloger made from the same item. Nothing here knows which model runs.
 */

export const fieldNames = [
  'mainTitle',
  'subtitle',
  'responsibility',
  'edition',
  'place',
  'publisher',
  'date',
  'isbn',
  'lccn',
] as const

export type FieldName = (typeof fieldNames)[number]

/** What was read for each field: "" for nothing, and ISBNs as a list. */
export type Transcription = Record<Exclude<FieldName, 'isbn'>, string> & { isbn: string[] }

export const fieldLabels: Record<FieldName, string> = {
  mainTitle: 'Title',
  subtitle: 'Subtitle',
  responsibility: 'Statement of responsibility',
  edition: 'Edition',
  place: 'Place of publication',
  publisher: 'Publisher',
  date: 'Date',
  isbn: 'ISBN',
  lccn: 'LCCN',
}

/** Which page a photo shows, as the cataloger says: the title and statement of responsibility come from the title page. */
export const pages = ['Title page', 'Verso', 'CIP block', 'Other'] as const

export type Page = (typeof pages)[number]

/** What was read from one photo, before anything was decided about it. */
export interface Reading {
  page: Page
  lines: string
}

/** Held to by the model's output, so what comes back always parses. */
export const schema = {
  type: 'object',
  properties: {
    mainTitle: { type: 'string' },
    subtitle: { type: 'string' },
    responsibility: { type: 'string' },
    edition: { type: 'string' },
    place: { type: 'string' },
    publisher: { type: 'string' },
    date: { type: 'string' },
    isbn: { type: 'array', items: { type: 'string' } },
    lccn: { type: 'string' },
  },
  required: [...fieldNames],
  additionalProperties: false,
} as const

/**
 * Two steps, since a small model does better at each alone: first every line
 * on each photo is read, with nothing decided about it; then, from that text
 * alone, the lines are sorted into fields. The lines are kept, so a cataloger
 * can check what was read against the photo before what it was taken to be.
 */
export const readingInstructions = `You read photos of a book's title page, its verso and any CIP (Cataloging in Publication) block for a library cataloger.

Transcribe every line of text in the photo, from top to bottom, exactly as printed, keeping every letter, number, punctuation mark and diacritic. Write one line of the item per line of your answer. Start each line with the size of its type, as [large], [medium] or [small]. Copy every digit as printed, and write ? for any letter or digit you can't make out: never fill one in. Leave out nothing, and add nothing that is not printed.`

export const readingPrompt = 'Transcribe every line in this photo.'

export const fieldInstructions = `You help a library cataloger. You are given lines of text read from photos of a book. Each photo's lines are headed by the page it shows: Title page, Verso, CIP block or Other. Each line starts with the size of its type.

From those lines, report:
- mainTitle: the title proper, only from the title page, usually in the largest type there
- subtitle: other title information, such as a subtitle, only from the title page
- responsibility: the statement of responsibility, only from the title page: the authors, editors or translators as it names them, with any words that go with them, such as "by" or "edited by"
- edition: the edition statement, such as "Second edition"
- place: the place of publication: only the first one named, if there are several
- publisher: the publisher's name
- date: the date of publication, or the copyright date if there is no other
- isbn: every ISBN, digits and X only
- lccn: the Library of Congress Control Number, often on the verso or in the CIP block

The rest can come from any page. A series title, a publisher's name or an author's name can be printed large too: they are not the title. Copy each value from the lines exactly, capitals and all, without the type size. Leave a field empty ("" or []) if it is not in the lines. Never guess, and never add anything that is not in the lines.`

/** The lines read from each photo, headed by its page, as the second step is given them. */
export function fieldPrompt(readings: readonly Reading[]): string {
  return readings.map(({ page, lines }) => `${page}:\n${lines.trim()}`).join('\n\n')
}

export function emptyTranscription(): Transcription {
  return { mainTitle: '', subtitle: '', responsibility: '', edition: '', place: '', publisher: '', date: '', isbn: [], lccn: '' }
}

/** The model's answer, read leniently: a missing or mistyped field is empty. */
export function parseTranscription(text: string): Transcription {
  const json: unknown = JSON.parse(text)
  const result = emptyTranscription()
  if (typeof json !== 'object' || json === null) return result
  const object = json as Record<string, unknown>
  for (const name of fieldNames) {
    const value = object[name]
    if (name === 'isbn') result.isbn = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
    else if (typeof value === 'string') result[name] = value
  }
  return result
}

/**
 * The same fields from a bounded description in Blue Core, as the cataloger
 * transcribed them: what a model's reading is scored against. A field with
 * several values, such as two places, is joined with " ; ".
 */
export function fromRecord(instance: JsonObject): Transcription {
  const title = nodes(instance.title).find((node) => types(node).includes('Title'))
  const publications = nodes(instance.provisionActivity).filter((node) => types(node).includes('Publication'))
  const published = (prop: string) => joined(publications.flatMap((node) => values(node[prop])))
  return {
    mainTitle: joined(values(title?.mainTitle)),
    subtitle: joined(values(title?.subtitle)),
    responsibility: joined(values(instance.responsibilityStatement)),
    edition: joined(values(instance.editionStatement)),
    place: published('bflc:simplePlace'),
    publisher: published('bflc:simpleAgent'),
    date: published('bflc:simpleDate'),
    isbn: nodes(instance.identifiedBy)
      .filter((node) => types(node).includes('Isbn'))
      .flatMap((node) => values(node['rdf:value']).map(text))
      .map(isbnDigits)
      .filter(Boolean),
    lccn: nodes(instance.identifiedBy)
      .filter((node) => types(node).includes('Lccn'))
      .flatMap((node) => values(node['rdf:value']).map(text))
      .map(normalizedLccn)
      .filter(Boolean)
      .join(' ; '),
  }
}

function values(json: Json | undefined): Json[] {
  return Array.isArray(json) ? json : json === undefined || json === null ? [] : [json]
}

function nodes(json: Json | undefined): JsonObject[] {
  return values(json).filter((value): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value))
}

function types(node: JsonObject): string[] {
  return values(node['@type']).filter((type): type is string => typeof type === 'string')
}

function text(value: Json): string {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && '@value' in value) return String(value['@value'])
  return ''
}

function joined(list: Json[]): string {
  return list
    .map(text)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ; ')
}

/** An ISBN as digits and X, without hyphens or a qualifier such as "(pbk.)". */
export function isbnDigits(isbn: string): string {
  return (isbn.match(/[\dXx][\dXx -]{8,}[\dXx]/)?.[0] ?? '').replace(/[ -]/g, '').toUpperCase()
}

/** Whether an ISBN's check digit fits the rest, as a correctly read one always does. */
export function isbnValid(isbn: string): boolean {
  const digits = isbnDigits(isbn)
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce((total, d, i) => total + (d === 'X' ? 10 : Number(d)) * (10 - i), 0)
    return sum % 11 === 0
  }
  if (/^97[89]\d{10}$/.test(digits)) {
    const sum = [...digits].reduce((total, d, i) => total + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
    return sum % 10 === 0
  }
  return false
}

/**
 * An LCCN in LC's normalized form: no spaces, anything from a slash on
 * dropped, and the serial number after a hyphen padded to six digits, so
 * "2001-1234" is "2001001234".
 * https://www.loc.gov/marc/lccn-namespace.html
 */
export function normalizedLccn(lccn: string): string {
  const compact = lccn.replace(/\s+/g, '').split('/')[0] ?? ''
  const [year, serial] = compact.split('-')
  return (serial === undefined ? compact : `${year}${serial.padStart(6, '0')}`).toLowerCase()
}

/** Whether an LCCN has a shape LC issues: up to three letters, then a two-digit year and six digits, or since 2001 a four-digit year and six. */
export function lccnValid(lccn: string): boolean {
  return /^[a-z]{0,3}(\d{8}|\d{10})$/.test(normalizedLccn(lccn))
}

/**
 * How a reading compares with the cataloger's:
 * - exact: the same, apart from spacing and final punctuation;
 * - close: the same letters, differing only in the ways listed, which a
 *   cataloger checking against the image would have to catch;
 * - wrong: different text;
 * - missed: the record has it and the reading doesn't;
 * - added: the reading has something the record doesn't;
 * - absent: neither has it;
 * - misread: an ISBN or LCCN that can't be right, such as an ISBN whose check
 *   digit doesn't fit, which the editor would never offer.
 */
export type Outcome = 'exact' | 'close' | 'wrong' | 'missed' | 'added' | 'absent' | 'misread'

export type Difference = 'case' | 'punctuation' | 'diacritics'

export interface Score {
  outcome: Outcome
  differences: Difference[]
}

export function score(read: Transcription, expected: Transcription): Record<FieldName, Score> {
  const scores = {} as Record<FieldName, Score>
  for (const name of fieldNames) {
    scores[name] =
      name === 'isbn'
        ? compareIsbns(read.isbn, expected.isbn)
        : name === 'lccn'
          ? compareLccns(read.lccn, expected.lccn)
          : compareText(read[name], expected[name])
  }
  return scores
}

export function compareText(read: string, expected: string): Score {
  const a = tidy(read)
  const b = tidy(expected)
  if (!a && !b) return { outcome: 'absent', differences: [] }
  if (!a) return { outcome: 'missed', differences: [] }
  if (!b) return { outcome: 'added', differences: [] }
  if (a === b) return { outcome: 'exact', differences: [] }
  const all = Object.keys(folds) as Difference[]
  if (!sameUnder(a, b, all)) return { outcome: 'wrong', differences: [] }
  // Only the differences that matter: one is left out if the others are enough.
  return { outcome: 'close', differences: all.filter((d) => !sameUnder(a, b, all.filter((other) => other !== d))) }
}

const folds: Record<Difference, (s: string) => string> = {
  case: (s) => s.toLowerCase(),
  punctuation: (s) => s.replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim(),
  diacritics: (s) => s.normalize('NFD').replace(/\p{M}/gu, ''),
}

function sameUnder(a: string, b: string, differences: Difference[]): boolean {
  const fold = (s: string) => differences.reduce((t, d) => folds[d](t), s)
  return fold(a) === fold(b)
}

/** Spacing collapsed, composed Unicode, and the ISBD punctuation that ends a MARC subfield dropped. */
function tidy(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/\s*[,;:/.=]$/, '').trim()
}

function compareIsbns(read: string[], expected: string[]): Score {
  if (read.some((isbn) => !isbnValid(isbn))) return { outcome: 'misread', differences: [] }
  const a = new Set(read.map(isbnDigits).filter(Boolean))
  const b = new Set(expected.map(isbnDigits).filter(Boolean))
  if (a.size === 0 && b.size === 0) return { outcome: 'absent', differences: [] }
  if (a.size === 0) return { outcome: 'missed', differences: [] }
  if (b.size === 0) return { outcome: 'added', differences: [] }
  const same = a.size === b.size && [...a].every((isbn) => b.has(isbn))
  return { outcome: same ? 'exact' : [...a].some((isbn) => b.has(isbn)) ? 'close' : 'wrong', differences: [] }
}

function compareLccns(read: string, expected: string): Score {
  if (read.trim() && !lccnValid(read)) return { outcome: 'misread', differences: [] }
  return compareText(normalizedLccn(read), expected.split(' ; ').map(normalizedLccn).join(' ; '))
}
