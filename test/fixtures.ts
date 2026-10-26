import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { JsonObject } from '../src/doc/model'

const root = join(import.meta.dirname, 'bibframe-json')

export function example(name: 'bounded' | 'linked'): JsonObject {
  return JSON.parse(readFileSync(join(root, 'example', `${name}.json`), 'utf8'))
}

/** Every document the conformance cases say a reader must accept. */
export function acceptedDocuments(): [string, JsonObject][] {
  return (['linked', 'bounded'] as const).flatMap((shape) => {
    const dir = join(root, 'conformance', shape, 'accept')
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name): [string, JsonObject] => [
        `${shape}/${name}`,
        JSON.parse(readFileSync(join(dir, name), 'utf8')).document,
      ])
  })
}
