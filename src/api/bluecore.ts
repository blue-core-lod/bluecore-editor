import type { JsonObject } from '../doc/model'
import { contextUrl } from '../schema/context'
import { boundedUrl, isBluecore, searchUrl } from './endpoints'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** A bounded description as Blue Core serves it, with the version of each resource in it. */
export interface Loaded {
  json: JsonObject
  /** For If-Match when each resource is saved; null if Blue Core didn't send one. */
  etags: { instance: string | null; work: string | null }
}

export async function loadBounded(uri: string, token?: string): Promise<Loaded> {
  const response = await request(boundedUrl(uri), token)
  const json: unknown = await response.json()
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new ApiError(`${uri} did not return a JSON-LD document`, response.status)
  }
  const document = json as JsonObject
  if (document['@context'] !== contextUrl) {
    throw new ApiError(`${uri} is not a bibframe-json v0.1 description`, response.status)
  }
  return {
    json: document,
    etags: {
      instance: response.headers.get('Bluecore-Instance-ETag'),
      work: response.headers.get('Bluecore-Work-ETag'),
    },
  }
}

export interface SearchHit {
  uri: string
  title: string
}

export async function searchInstances(query: string, token?: string): Promise<{ total: number; hits: SearchHit[] }> {
  const response = await request(searchUrl(query), token)
  const body = (await response.json()) as { total?: number; results?: { data?: JsonObject }[] }
  const hits = (body.results ?? []).flatMap(({ data }) => {
    const uri = data?.['@id']
    return typeof uri === 'string' ? [{ uri, title: titleOf(data) }] : []
  })
  return { total: body.total ?? hits.length, hits }
}

/** "Main title : subtitle" from a stored Instance, for a search result. */
function titleOf(data: JsonObject | undefined): string {
  const title = Array.isArray(data?.title) ? data.title[0] : undefined
  if (!title || typeof title !== 'object' || Array.isArray(title)) return '(untitled)'
  const part = (name: string) => {
    const values = title[name]
    const first = Array.isArray(values) ? values[0] : undefined
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && !Array.isArray(first) && typeof first['@value'] === 'string') {
      return first['@value']
    }
    return undefined
  }
  return [part('mainTitle'), part('subtitle')].filter(Boolean).join(' : ') || '(untitled)'
}

async function request(url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/ld+json, application/json' }
  if (token && isBluecore(url)) headers.Authorization = `Bearer ${token}`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? 'Blue Core has no such Instance' : `Blue Core said ${response.status}`,
      response.status,
    )
  }
  return response
}
