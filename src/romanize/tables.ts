import { isValueObject, type Literal } from '../doc/model'
import vendored from './tables.json'

/**
 * ScriptShifter's romanization tables, and the scripts text is written in.
 *
 * A value in a non-Latin script and its romanization are two values of one
 * property, told apart by their language tags: LC's data tags the original
 * script with its language and script ("ru-cyrl") and leaves the romanization
 * untagged. bibframe2marc puts the untagged value in the regular field and the
 * other in an 880, so the script subtag is what matters.
 */

/** One of ScriptShifter's tables, with the tag the editor writes on a value in its script. */
export interface Table {
  /** ScriptShifter's name for it: "russian". */
  id: string
  label: string
  /** Lowercase, as LC's data has it: "ru-cyrl". */
  tag: string
  /** The MARC language codes it's for; "mul" for a table of a script's generic rules. */
  marc: string[]
  /** Whether it romanizes (script to Roman), and whether it goes back (Roman to script). */
  s2r: boolean
  r2s: boolean
  description?: string
}

export type Direction = 's2r' | 'r2s'

export const tables: readonly Table[] = vendored

export function tableById(id: string): Table | undefined {
  return tables.find((table) => table.id === id)
}

/** The script subtag of a tag, "cyrl" in "ru-Cyrl", if it has one. */
export function scriptOfTag(tag: string): string | undefined {
  return tag
    .toLowerCase()
    .split('-')
    .slice(1)
    .find((subtag) => /^[a-z]{4}$/.test(subtag))
}

/** The language subtag of a tag, "ru" in "ru-cyrl". */
export function languageOfTag(tag: string): string {
  return tag.toLowerCase().split('-')[0] ?? ''
}

/**
 * Scripts a table can be written in that are a mix of Unicode's: Korean is
 * Hangul and Han, Japanese is Han and kana.
 */
const mixed: Record<string, string[]> = {
  kore: ['hang', 'hani'],
  jpan: ['hani', 'hira', 'kana'],
  hrkt: ['hira', 'kana'],
  cyrs: ['cyrl'],
}

/**
 * The script a table for this one is in: Traditional and Simplified Han are
 * Han, and Hangul alone is Korean, as the tables have them.
 */
const tableScript: Record<string, string> = { hant: 'hani', hans: 'hani', hang: 'kore' }

function sameScript(a: string, b: string): boolean {
  return (tableScript[a] ?? a) === (tableScript[b] ?? b)
}

/** The Unicode scripts to look for in text: Latin, and every one a table is in. */
const unicodeScripts = [
  ...new Set(['latn', 'hang', 'hira', 'kana', ...tables.flatMap((table) => mixed[scriptOfTag(table.tag) ?? ''] ?? [scriptOfTag(table.tag) ?? ''])]),
]
  .filter(Boolean)
  .map((script) => ({ script, pattern: new RegExp(`\\p{Script=${titleCase(script)}}`, 'u') }))

/**
 * The script most of a text's letters are in, as a lowercase ISO 15924 code,
 * or undefined for text with no letters, such as "[1990]". Kana make it
 * Japanese and Hangul Korean, though Han may be most of the letters.
 */
export function scriptOfText(text: string): string | undefined {
  const counts = new Map<string, number>()
  for (const char of text) {
    const found = unicodeScripts.find(({ pattern }) => pattern.test(char))
    if (found) counts.set(found.script, (counts.get(found.script) ?? 0) + 1)
  }
  if (counts.has('hira') || counts.has('kana')) return 'jpan'
  if (counts.has('hang')) return 'kore'
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/**
 * What script a text literal is in: its tag's script if the tag says, or else
 * what its letters are. Undefined for anything but text, and for text with no
 * letters.
 */
export function scriptOf(literal: Literal): string | undefined {
  const text = isValueObject(literal) ? literal['@value'] : literal
  if (typeof text !== 'string') return undefined
  const tag = isValueObject(literal) ? literal['@language'] : undefined
  return (tag && scriptOfTag(tag)) || scriptOfText(text)
}

/** Whether a literal is text in a script other than Latin. */
export function isOriginalScript(literal: Literal): boolean {
  const script = scriptOf(literal)
  return script !== undefined && script !== 'latn'
}

/** Whether a literal is text in Latin script, or text with no letters, either of which a romanization can be. */
export function isRoman(literal: Literal): boolean {
  if (isValueObject(literal) ? typeof literal['@value'] !== 'string' : typeof literal !== 'string') return false
  const script = scriptOf(literal)
  return script === undefined || script === 'latn'
}

const scriptNames = new Intl.DisplayNames(['en'], { type: 'script' })

/** A script as a cataloger reads it: "cyrl" is "Cyrillic". */
export function scriptName(script: string): string {
  try {
    return scriptNames.of(titleCase(script)) ?? script
  } catch {
    return script
  }
}

function titleCase(script: string): string {
  return script.charAt(0).toUpperCase() + script.slice(1).toLowerCase()
}

/**
 * The tables that could convert a value, best first. A table must go in the
 * direction asked and, given a script, be in it. Those for the value's own
 * language, from its tag, or the record's languages (MARC codes, from
 * bf:language) come first; then a script's generic rules; then the rest.
 */
export function candidates(
  direction: Direction,
  { script, tag, languages = [] }: { script?: string; tag?: string; languages?: readonly string[] },
): Table[] {
  const language = tag ? languageOfTag(tag) : undefined
  const rank = (table: Table) => {
    if (language && language !== 'und' && languageOfTag(table.tag) === language) return 0
    if (table.marc.some((code) => languages.includes(code))) return 1
    if (table.marc.includes('mul') || ['und', 'mul'].includes(languageOfTag(table.tag))) return 2
    return 3
  }
  return tables
    .filter((table) => table[direction] && (!script || sameScript(scriptOfTag(table.tag) ?? '', script)))
    .map((table) => ({ table, rank: rank(table) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ table }) => table)
}

/** Whether a table is for one of these languages, rather than only in the right script. */
export function isFor(table: Table, languages: readonly string[]): boolean {
  return table.marc.some((code) => languages.includes(code))
}
