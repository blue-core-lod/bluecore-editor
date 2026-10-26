// Copies the bibframe-json v0.1 artifacts the editor is built on into
// src/schema/bibframe-json/, pinned to one commit, and its examples and
// conformance cases into test/bibframe-json/ so the editor is tested against
// the same verdicts as every other reader.
//
// Vendored rather than fetched at runtime: v0.1 is frozen, the editor should
// work offline, and vocabulary.json isn't published on bibframe-json.org (only
// the context and schemas are), so the alternative would be raw GitHub URLs.
// To move to a new commit, change COMMIT, run `npm run vendor:bibframe-json`,
// and review the diff.

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT = '31878f3f99f369748a16923e8be0a9ec02e6e983'
const FILES = [
  'bibframe_json/v0.1/schema/linked.json',
  'bibframe_json/v0.1/schema/bounded.json',
  'bibframe_json/v0.1/schema/ontology.json',
  'bibframe_json/v0.1/context/bibframe.jsonld',
  'bibframe_json/vocabulary.json',
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src', 'schema', 'bibframe-json')
const testDir = join(root, 'test', 'bibframe-json')
await mkdir(outDir, { recursive: true })

const source = { repository: 'https://github.com/blue-core-lod/bibframe-json', commit: COMMIT, files: {} }
for (const path of FILES) {
  const url = `https://raw.githubusercontent.com/blue-core-lod/bibframe-json/${COMMIT}/${path}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  const text = await response.text()
  // Parse to fail early on anything that isn't JSON.
  JSON.parse(text)
  const name = path.split('/').pop()
  await writeFile(join(outDir, name), text)
  source.files[name] = { path, sha256: createHash('sha256').update(text).digest('hex') }
  console.log(`${name} ← ${path}`)
}
await writeFile(join(outDir, 'SOURCE.json'), `${JSON.stringify(source, null, 2)}\n`)

const tree = await fetch(
  `https://api.github.com/repos/blue-core-lod/bibframe-json/git/trees/${COMMIT}?recursive=1`,
).then((response) => {
  if (!response.ok) throw new Error(`tree: ${response.status}`)
  return response.json()
})
const fixtures = tree.tree
  .map((entry) => entry.path)
  .filter((path) => /^(conformance|example)\/.*\.json$/.test(path))
for (const path of fixtures) {
  const url = `https://raw.githubusercontent.com/blue-core-lod/bibframe-json/${COMMIT}/${path}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  await mkdir(dirname(join(testDir, path)), { recursive: true })
  await writeFile(join(testDir, path), await response.text())
}
console.log(`${fixtures.length} fixtures → test/bibframe-json/`)
