import { contextUrl } from '../schema/context'
import type { Json, JsonObject } from './model'

/**
 * A description that isn't in Blue Core yet. Until it is saved its resources
 * have no Blue Core URIs, so they carry placeholders: something to key the
 * draft by and to link the Instance to its Work. A save creates each resource
 * with an empty @id, Blue Core mints its URI, and the placeholder gives way
 * to it (api/save.ts).
 */

const prefix = 'urn:bluecore-editor:new:'

export function placeholderUri(id: string): string {
  return `${prefix}${id}`
}

export function isPlaceholder(uri: unknown): boolean {
  return typeof uri === 'string' && uri.startsWith(prefix)
}

/** The id a placeholder was made from, for the ?new=<id> route. */
export function placeholderId(uri: string): string {
  return uri.slice(prefix.length)
}

/**
 * An empty print Instance of a text Work: a book, the commonest kind. The
 * cataloger can make it another kind from the header (kindChange in
 * schema/guidance.ts), so nothing has to be chosen before starting.
 */
export function blankDescription(instanceUri: string): JsonObject {
  return {
    '@context': contextUrl,
    '@id': instanceUri,
    '@type': ['Instance', 'Print'],
    instanceOf: [{ '@id': `${instanceUri}:work`, '@type': ['Work', 'Text'] }],
  }
}

/** Whether some JSON names a resource that isn't in Blue Core yet. */
export function mentionsPlaceholder(json: Json): boolean {
  if (isPlaceholder(json)) return true
  if (Array.isArray(json)) return json.some(mentionsPlaceholder)
  return json !== null && typeof json === 'object' && Object.values(json).some(mentionsPlaceholder)
}

/** A copy of some JSON with every string that names a resource in `uris` renamed. */
export function renamed<T extends Json>(json: T, uris: Readonly<Record<string, string>>): T {
  if (typeof json === 'string') return (uris[json] ?? json) as T
  if (Array.isArray(json)) return json.map((item) => renamed(item, uris)) as T
  if (json === null || typeof json !== 'object') return json
  return Object.fromEntries(Object.entries(json).map(([name, value]) => [name, renamed(value, uris)])) as T
}
