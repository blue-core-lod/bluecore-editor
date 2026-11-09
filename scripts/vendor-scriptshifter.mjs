// Copies ScriptShifter's list of romanization tables into
// src/romanize/tables.json, each with the language and script tag the editor
// writes on a value in that table's script ("russian" is ru-cyrl).
//
// ScriptShifter names a table's language only by its MARC code, sometimes a
// collective one, and never its script, so the tags come from
// scripts/scriptshifter-tags.json. That started as Marva's mapping
// (lcnetdev/marva-quartz, src/lib/scriptShifterLangCodes.json, CC0), with the
// tables it lacked added. Tags are written in lowercase, as LC's data has them.
//
// A table with no tag, or whose tag is Latin (a table from one romanization
// to another), is left out and listed, so a new table is noticed. To refresh,
// run `npm run vendor:scriptshifter` and review the diff.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.SCRIPTSHIFTER_URL ?? 'https://bibframe.org/scriptshifter/'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tags = JSON.parse(await readFile(join(root, 'scripts', 'scriptshifter-tags.json'), 'utf8'))
const out = join(root, 'src', 'romanize', 'tables.json')

const response = await fetch(new URL('languages', url))
if (!response.ok) throw new Error(`${url}languages: ${response.status}`)
const languages = await response.json()

const tables = []
const left = []
for (const [id, language] of Object.entries(languages)) {
  const tag = tags[id]?.toLowerCase()
  if (!tag || tag.endsWith('-latn')) {
    left.push(id)
    continue
  }
  // An alias uses another table's rules, and says nothing of its own about directions.
  const rules = language.alias_of ? languages[language.alias_of] : language
  tables.push({
    id,
    label: language.label,
    tag,
    marc: (language.marc_code ?? '').split(/,\s*/).filter(Boolean),
    s2r: Boolean(rules?.has_s2r),
    r2s: Boolean(rules?.has_r2s),
    ...(language.description ? { description: language.description.trim() } : {}),
  })
}
tables.sort((a, b) => a.label.localeCompare(b.label, 'en'))
const unknown = Object.keys(tags).filter((id) => !languages[id])
await writeFile(out, `${JSON.stringify(tables, null, 1)}\n`)
console.log(`${tables.length} tables`)
if (left.length > 0) console.log(`left out, with no tag or a Latin one: ${left.join(', ')}`)
if (unknown.length > 0) console.log(`tagged but no longer in ScriptShifter: ${unknown.join(', ')}`)
