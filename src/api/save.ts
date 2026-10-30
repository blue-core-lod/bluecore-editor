import { isPlaceholder, mentionsPlaceholder, renamed } from '../doc/blank'
import type { Log } from '../doc/log'
import { getNode, type Doc, type JsonObject, type Key } from '../doc/model'
import { principals, unsaved, withId, type Saved } from '../doc/resources'
import { getValidators } from '../schema/validate'
import { createUrl, resourceUrl } from './endpoints'

/**
 * Writing one resource back to Blue Core. A bounded description is saved as
 * separate writes, one per changed resource, each conditional on the version
 * the editor read: Blue Core has no transaction spanning two resources, so
 * each write succeeds or fails on its own and the editor reports which.
 */

export type WriteOutcome =
  /** `created` is the URI Blue Core minted, when the write made a new resource. */
  | { ok: true; etag: string | null; created?: string }
  /** Someone saved this resource since it was read; etag is its version now. */
  | { ok: false; conflict: true; message: string; etag: string | null }
  | { ok: false; conflict: false; message: string }

export async function writeResource(
  uri: string,
  json: JsonObject,
  etag: string | null,
  token: string | undefined,
): Promise<WriteOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/ld+json', Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  // Without an ETag the write would replace whatever is there; Blue Core sends
  // one with every read, so its absence means something is wrong, and the
  // write is refused rather than risk overwriting another cataloger's work.
  if (!etag) return { ok: false, conflict: false, message: 'Blue Core sent no version to save against' }
  headers['If-Match'] = etag

  let response: Response
  try {
    response = await fetch(resourceUrl(uri), { method: 'PUT', headers, body: JSON.stringify(json) })
  } catch (error) {
    return { ok: false, conflict: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (response.ok) return { ok: true, etag: response.headers.get('ETag') }
  if (response.status === 412) {
    const body = (await response.json().catch(() => ({}))) as { etag?: string }
    return { ok: false, conflict: true, message: 'changed in Blue Core since you opened it', etag: body.etag ?? null }
  }
  return { ok: false, conflict: false, message: await failure(response) }
}

/**
 * Create a resource, sent with an empty @id for Blue Core to mint its URI.
 * Its reply carries no ETag, so a resource created this way is read back
 * before it can be saved again (Editor, after a save).
 */
export async function createResource(
  kind: 'Instance' | 'Work',
  json: JsonObject,
  token: string | undefined,
): Promise<WriteOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/ld+json', Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(createUrl(kind), { method: 'POST', headers, body: JSON.stringify({ ...json, '@id': '' }) })
  } catch (error) {
    return { ok: false, conflict: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (!response.ok) return { ok: false, conflict: false, message: await failure(response) }
  const body = (await response.json().catch(() => null)) as { uri?: unknown } | null
  if (typeof body?.uri !== 'string') return { ok: false, conflict: false, message: 'Blue Core didn’t say what it created' }
  return { ok: true, etag: null, created: body.uri }
}

async function failure(response: Response): Promise<string> {
  if (response.status === 401) return 'your sign-in has expired; sign in again'
  if (response.status === 403) return 'your account isn’t allowed to edit descriptions'
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null
  const detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body?.detail ?? '')
  return `Blue Core said ${response.status}${detail ? `: ${detail}` : ''}`
}

/** Where the editor stands with Blue Core: what it holds, and the version of each resource it read. */
export interface SaveState {
  log: Log
  current: Doc
  saved: Saved
  etags: Record<Key, string | null>
}

export interface ResourceSave {
  key: Key
  kind: 'Instance' | 'Work'
  uri: string
  json: JsonObject
  outcome: WriteOutcome
}

/**
 * Write every resource that differs from what Blue Core holds, the Work
 * first, since the Instance names it. A resource not in Blue Core yet is
 * created, and the URI minted for a new Work goes into the Instance before
 * it is sent. A resource whose linked description doesn't fit bibframe-json
 * isn't sent at all.
 *
 * Each result's uri and json are the resource as Blue Core now has it, with
 * minted URIs in place of placeholders.
 */
export async function saveDescription(state: SaveState, token: string | undefined): Promise<ResourceSave[]> {
  const { instance } = principals(state.current)
  const pending = unsaved(state.current, state.saved).toSorted(
    (a, b) => Number(a.key === instance) - Number(b.key === instance),
  )
  const { linked } = getValidators()
  const minted: Record<string, string> = {}
  const results: ResourceSave[] = []
  for (const pendingResource of pending) {
    const { key } = pendingResource
    const kind = key === instance ? 'Instance' : 'Work'
    const uri = String(getNode(state.current, key).keywords['@id'])
    const json = renamed(pendingResource.json, minted)
    let outcome: WriteOutcome
    if (!linked(json)) {
      outcome = { ok: false, conflict: false, message: 'it doesn’t fit bibframe-json’s linked shape, so it wasn’t sent' }
    } else if (!isPlaceholder(uri)) {
      outcome = await writeResource(uri, json, state.etags[key] ?? null, token)
    } else if (mentionsPlaceholder({ ...json, '@id': '' })) {
      // Its Work wasn't created, so there is nothing yet to link it to.
      outcome = { ok: false, conflict: false, message: 'its Work isn’t in Blue Core yet, so it can’t be created' }
    } else {
      outcome = await createResource(kind, json, token)
    }
    const created = outcome.ok ? outcome.created : undefined
    if (created) minted[uri] = created
    results.push({ key, kind, uri: created ?? uri, json: created ? renamed(json, minted) : json, outcome })
  }
  return results
}

/**
 * The state after a save. Each resource that was written is recorded as
 * saved, at its new version, so a retry writes only what failed. Once nothing
 * is left unsaved the history starts again from here, since "unsaved changes"
 * would no longer be true of any of it. Edits made while the save was in
 * flight stay unsaved, because what was written is the description as sent.
 */
export function afterSave<S extends SaveState>(state: S, results: readonly ResourceSave[]): S {
  const saved = { ...state.saved }
  const etags = { ...state.etags }
  // A created resource takes the URI Blue Core minted, in the base as well as
  // the current document, so replaying the history keeps it.
  let { log, current } = state
  for (const { key, uri, json, outcome } of results) {
    if (!outcome.ok) continue
    if (outcome.created) {
      log = { ...log, base: withId(log.base, key, uri) }
      current = withId(current, key, uri)
    }
    saved[key] = json
    etags[key] = outcome.etag
  }
  if (unsaved(current, saved).length === 0) log = { base: current, changes: [] }
  return { ...state, log, current, saved, etags }
}
