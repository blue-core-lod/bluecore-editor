// Writes docs/profiles/: the field profile of each kind of resource, worked
// out by the editor's own layout code from src/schema/guidance.json and
// guidance-overrides.json. Run `npm run profiles` after either changes, or
// after a change to the sections, and review the diff; test/profiles.test.ts
// fails until the committed files match.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'docs', 'profiles')

// The editor's config reads the page's origin, which only matters for talking to Blue Core.
globalThis.window ??= { location: { origin: 'http://localhost' } }

const { module } = await runnerImport(join(root, 'scripts', 'profiles.ts'))
await mkdir(out, { recursive: true })
for (const [name, text] of Object.entries(module.renderProfiles())) {
  await writeFile(join(out, name), text)
  console.log(`docs/profiles/${name}`)
}
