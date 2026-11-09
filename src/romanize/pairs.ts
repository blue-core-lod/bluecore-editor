import { getNode, isValueObject, newKey, type Doc, type Key, type Literal, type Value } from '../doc/model'
import type { Op } from '../doc/patch'
import { principals } from '../doc/resources'
import {
  isFor,
  isOriginalScript,
  isRoman,
  languageOfTag,
  scriptOf,
  scriptOfTag,
  scriptOfText,
  tables,
  type Direction,
  type Table,
} from './tables'

/**
 * A property's values as the cataloger sees them: a value in a non-Latin
 * script and its romanization side by side, everything else on its own.
 */
export type Group =
  | { kind: 'single'; value: Value }
  | { kind: 'pair'; romanized: TextValue; original: TextValue; script: string }

export type TextValue = { key: Key; literal: Literal }

/**
 * Pairs a property's values. LC's data has no link between a value and its
 * romanization beyond their being neighbouring values of the same property,
 * the romanization first. So a value in a non-Latin script pairs with a
 * romanization just before it, or failing that just after it, as another
 * editor may have put them; the editor itself always puts a conversion beside
 * the value it's from. A pair takes the place of the first of its two.
 */
export function groups(values: readonly Value[]): Group[] {
  const partner = new Map<Key, Group>()
  const pairUp = (original: Value | undefined, roman: Value | undefined) => {
    if (!original || !roman || !('literal' in original) || !('literal' in roman)) return
    if (partner.has(original.key) || partner.has(roman.key)) return
    if (!isOriginalScript(original.literal) || !isRomanization(roman.literal)) return
    const pair: Group = { kind: 'pair', romanized: roman, original, script: scriptOf(original.literal) ?? '' }
    partner.set(original.key, pair)
    partner.set(roman.key, pair)
  }
  values.forEach((value, i) => pairUp(value, values[i - 1]))
  values.forEach((value, i) => pairUp(value, values[i + 1]))
  const shown = new Set<Group>()
  return values.flatMap((value): Group[] => {
    const pair = partner.get(value.key)
    if (!pair) return [{ kind: 'single', value }]
    if (shown.has(pair)) return []
    shown.add(pair)
    return [pair]
  })
}

/**
 * Whether a literal can be the romanization in a pair: Latin text, or text
 * with no letters, either untagged as in LC's data or tagged as Latin
 * ("ru-latn"). Not text tagged with a language alone ("en"), which is that
 * language rather than a romanization; not a date or number with a datatype;
 * and not a link.
 */
export function isRomanization(literal: Literal): boolean {
  if (!isRoman(literal)) return false
  if (isValueObject(literal)) {
    if (literal['@type']) return false
    const tag = literal['@language']
    if (tag) return scriptOfTag(tag) === 'latn'
  }
  return !/^https?:\/\//.test(textOf(literal))
}

/** The record's languages as MARC codes ("rus"), from bf:language on the Work and the Instance. */
export function recordLanguages(doc: Doc): string[] {
  const { instance, work } = principals(doc)
  const codes = [work, instance].flatMap((key) =>
    key === null
      ? []
      : (getNode(doc, key).props.language ?? []).flatMap((value) => {
          const uri = 'node' in value ? getNode(doc, value.node).keywords['@id'] : value.literal
          const match = typeof uri === 'string' ? /\/vocabulary\/languages\/([a-z]{3})$/.exec(uri) : null
          return match?.[1] ? [match[1]] : []
        }),
  )
  return [...new Set(codes)]
}

/**
 * The fields transcribed from the item, where LC's data pairs a romanization
 * with the original script: titles, statements, and the publisher and place
 * as given. Not dates, numbers or notes, which are rarely worth it.
 */
export const transcribed = new Set([
  'mainTitle',
  'subtitle',
  'partName',
  'responsibilityStatement',
  'editionStatement',
  'publicationStatement',
  'distributionStatement',
  'manufactureStatement',
  'provisionActivityStatement',
  'seriesStatement',
  'bflc:simpleAgent',
  'bflc:simplePlace',
])

/**
 * Which conversion to offer on a value with no partner: romanizing one in a
 * non-Latin script, in any field; adding the original script to a romanized
 * one, in a transcribed field of a record in a language ScriptShifter has a
 * table for.
 */
export function offerFor(prop: string, literal: Literal, languages: readonly string[]): Direction | undefined {
  if (isValueObject(literal) && literal['@type']) return undefined
  if (isOriginalScript(literal)) return 's2r'
  if (!transcribed.has(prop) || !isRomanization(literal) || scriptOfText(textOf(literal)) !== 'latn') return undefined
  return hasOriginalTables(languages) ? 'r2s' : undefined
}

/** Whether ScriptShifter can go from Roman back to script for one of these languages. */
export function hasOriginalTables(languages: readonly string[]): boolean {
  return languages.length > 0 && tables.some((table) => table.r2s && isFor(table, languages))
}

/** The text of a text literal. */
export function textOf(literal: Literal): string {
  return isValueObject(literal) ? String(literal['@value']) : String(literal)
}

/** A literal with new text, keeping its tag. */
function withText(literal: Literal, text: string): Literal {
  return isValueObject(literal) ? { ...literal, '@value': text } : text
}

/**
 * Adding a romanization of a value in a non-Latin script: the romanization
 * goes in untagged just before it, as in LC's data, and the original is tagged
 * with the table's language and script if it doesn't say its script already.
 */
export function addRomanizationOps(
  node: Key,
  prop: string,
  values: readonly Value[],
  original: TextValue,
  romanization: string,
  table: Table,
): Op[] {
  const index = values.findIndex((value) => value.key === original.key)
  const after = index > 0 ? (values[index - 1]?.key ?? null) : null
  const ops: Op[] = [
    { op: 'insert', node, prop, after, value: { key: newKey(), literal: romanization }, nodes: [] },
  ]
  const tagged = tagWith(original.literal, table)
  if (tagged !== original.literal) ops.push({ op: 'set', node, prop, value: original.key, from: original.literal, to: tagged })
  return ops
}

/** Adding the original script of a romanized value, tagged with the table's language and script, just after it. */
export function addOriginalOps(node: Key, prop: string, romanized: TextValue, original: string, table: Table): Op[] {
  return [
    {
      op: 'insert',
      node,
      prop,
      after: romanized.key,
      value: { key: newKey(), literal: { '@value': original, '@language': table.tag } },
      nodes: [],
    },
  ]
}

/** Replacing one value of a pair with a new conversion of the other, keeping its tag. */
export function replaceTextOps(node: Key, prop: string, value: TextValue, text: string): Op[] {
  return [{ op: 'set', node, prop, value: value.key, from: value.literal, to: withText(value.literal, text) }]
}

/**
 * The literal tagged with the table's script. A tag that already names a
 * script is kept; one that names only a language keeps it and gains the
 * script ("ru" becomes "ru-cyrl"); an untagged value takes the table's tag.
 */
function tagWith(literal: Literal, table: Table): Literal {
  const tag = isValueObject(literal) ? literal['@language'] : undefined
  if (tag && scriptOfTag(tag)) return literal
  const language = tag ? languageOfTag(tag) : languageOfTag(table.tag)
  return {
    ...(isValueObject(literal) ? literal : {}),
    '@value': textOf(literal),
    '@language': `${language}-${scriptOfTag(table.tag) ?? ''}`,
  }
}
