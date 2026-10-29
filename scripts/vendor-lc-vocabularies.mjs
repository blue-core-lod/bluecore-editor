// Copies the small LC vocabularies (carrier types, languages, relators…) into
// src/lookup/vocabularies.json as label, code and URI, so the editor offers
// them as picklists: instant, offline, and matched by any part of a label or
// by the MARC code catalogers already know ("aut", "eng", "nc").
//
// Vendored rather than looked up: QA only matches these on whole words, and
// they change rarely. To refresh them, run `npm run vendor:lc-vocabularies`
// and review the diff.

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VOCABULARIES = ['carriers', 'mediaTypes', 'contentTypes', 'issuance', 'relators', 'languages', 'countries']
const MADS = 'http://www.loc.gov/mads/rdf/v1#'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'src', 'lookup', 'vocabularies.json')

const vocabularies = {}
for (const name of VOCABULARIES) {
  const url = `https://id.loc.gov/vocabulary/${name}.json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  const graph = await response.json()
  const base = `http://id.loc.gov/vocabulary/${name}/`
  // The terms themselves, not the scheme, its change records or LC as publisher.
  const terms = graph
    .filter((node) => node['@id']?.startsWith(base) && node['@type']?.includes(`${MADS}Authority`))
    .flatMap((node) => {
      const label = node[`${MADS}authoritativeLabel`]?.[0]?.['@value']
      if (!label) return []
      const code = node[`${MADS}code`]?.[0]?.['@value'] ?? node['@id'].slice(base.length)
      return [{ uri: node['@id'], label, code }]
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'en'))
  if (terms.length === 0) throw new Error(`${url}: no terms`)
  vocabularies[name] = terms
  console.log(`${name}: ${terms.length}`)
}
await writeFile(out, `${JSON.stringify(vocabularies, null, 1)}\n`)
