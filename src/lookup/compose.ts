import type { Component } from '../doc/complex'
import type { Hit } from './qa'

/**
 * Composing a complex subject in the lookup, as one line of text: typing "--"
 * starts the next part, and the part the cursor is in is the one searched.
 * Each part picked from LC keeps its authority; the rest stay text.
 */

/**
 * A part can hold dashes of its own: the geographic subdivision "Germany--Aachen"
 * is one part. In the line its dashes are non-breaking hyphens (U+2011), as in
 * Marva, so they don't start a new part.
 */
export function inLine(label: string): string {
  return label.replaceAll('--', '\u2011\u2011')
}

export function fromLine(text: string): string {
  return text.replaceAll('\u2011', '-')
}

export interface Part {
  text: string
  /** Where the part's text starts and ends in the line, separators excluded. */
  start: number
  end: number
}

/** The parts of the line, where they are. A "--" before another hyphen ends an open date, not a part. */
export function partsOf(text: string): Part[] {
  const parts: Part[] = []
  let start = 0
  for (const match of text.matchAll(/--(?!-)/g)) {
    parts.push(part(text, start, match.index))
    start = match.index + 2
  }
  parts.push(part(text, start, text.length))
  return parts
}

function part(text: string, start: number, end: number): Part {
  const raw = text.slice(start, end)
  const lead = raw.length - raw.trimStart().length
  const trail = raw.length - raw.trimEnd().length
  return { text: raw.trim(), start: start + lead, end: Math.max(start + lead, end - trail) }
}

/** The part the cursor is in. A cursor just after a "--" is in the part it starts. */
export function partAt(parts: readonly Part[], caret: number): number {
  const index = parts.findIndex((part, i) => caret <= part.end || caret < (parts[i + 1]?.start ?? Infinity))
  return index === -1 ? parts.length - 1 : index
}

/** The line with one part's text replaced, and where the replacement ends. */
export function replacePart(text: string, part: Part, label: string): { text: string; end: number } {
  return { text: text.slice(0, part.start) + label + text.slice(part.end), end: part.start + label.length }
}

/** The parts picked from LC, by position; a part counts only while its text is still what was picked. */
export type Picked = Readonly<Record<number, Component>>

export function pickedAt(picked: Picked, parts: readonly Part[], index: number): Component | undefined {
  const component = picked[index]
  return component && inLine(component.label) === parts[index]?.text ? component : undefined
}

/** A hit as a part, keeping its authority. */
export function componentOf(hit: Hit): Component {
  return {
    label: hit.label,
    type: hit.type ?? 'mads:Topic',
    uri: hit.uri,
    ...(hit.marcKey ? { marcKey: hit.marcKey } : {}),
  }
}

/** A subdivision record (18X), such as "180 $xJews" or "181 $zGermany", which can't start a heading. */
export function isSubdivisionRecord(hit: Hit): boolean {
  return hit.marcKey !== undefined && /^18\d/.test(hit.marcKey)
}

/**
 * The subject the parts make: each picked part as picked, each other part as
 * text of the kind chosen for it (Topical unless chosen). Empty parts, as
 * after a trailing "--", are left out.
 */
export function composed(parts: readonly Part[], picked: Picked, kinds: Readonly<Record<number, string>>): Component[] {
  return parts.flatMap((part, index) => {
    if (!part.text) return []
    return [pickedAt(picked, parts, index) ?? { label: fromLine(part.text), type: kinds[index] ?? 'mads:Topic' }]
  })
}
