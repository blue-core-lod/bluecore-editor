import { config } from '../config'
import type { Direction } from './tables'

/** A conversion from ScriptShifter, with anything its table had to say about it. */
export interface Conversion {
  output: string
  warnings: string[]
}

/**
 * Converts text with one of ScriptShifter's tables, script to Roman or back.
 * LC's instance allows any origin, so the browser calls it directly.
 *
 * ScriptShifter returns decomposed Unicode, a letter then its diacritic, where
 * LC's data has them composed; the two look the same but don't match in a
 * search or a comparison, so the output is composed (NFC) here. A failure
 * comes back as an empty output with warnings, so that's an error too.
 */
export async function convert(
  table: string,
  text: string,
  direction: Direction,
  signal?: AbortSignal,
): Promise<Conversion> {
  const response = await fetch(`${config.scriptshifterUrl}trans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ lang: table, text, t_dir: direction, capitalize: 'no_change' }),
    signal,
  })
  if (!response.ok) throw new Error(`ScriptShifter returned ${response.status}`)
  const json = (await response.json()) as { output?: string; warnings?: string[] }
  const warnings = json.warnings ?? []
  const output = (json.output ?? '').normalize('NFC')
  if (!output.trim()) throw new Error(warnings.join(' ') || 'ScriptShifter returned nothing')
  return { output, warnings }
}
