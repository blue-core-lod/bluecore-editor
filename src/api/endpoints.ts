import { config } from '../config'

/**
 * Where the editor sends each request. Blue Core's resources are read and
 * written at their own URIs (/instances/…, /works/…), the ones it wants the
 * public to use; /api/ is for everything that isn't a resource. That is a
 * project decision that may change, so it lives here and nowhere else.
 */

/** The bounded description of an Instance: the Instance with its Work embedded. */
export function boundedUrl(uri: string): string {
  return `${uri}.cbd.jsonld`
}

/** Where a new resource is created, for Blue Core to mint its URI. Not a resource, so under /api/. */
export function createUrl(kind: 'Instance' | 'Work'): string {
  return new URL(`api/${kind === 'Work' ? 'works' : 'instances'}/`, config.bluecoreUrl).href
}

/** Where a resource's linked description is written. */
export function resourceUrl(uri: string): string {
  return uri
}

/** Where Blue Core uses an entity it doesn't hold as a resource of its own, such as an LC name. */
export function usageUrl(uri: string): string {
  const url = new URL('api/usage/', config.bluecoreUrl)
  url.search = new URLSearchParams({ uri }).toString()
  return url.href
}

export function searchUrl(query: string, offset = 0, limit = 20): string {
  const url = new URL('api/search/', config.bluecoreUrl)
  url.search = new URLSearchParams({ q: query, type: 'instances', limit: String(limit), offset: String(offset) }).toString()
  return url.href
}

/**
 * An Instance URI from whatever the cataloger typed: a URI as is, or a bare
 * UUID as one of this Blue Core's Instances.
 */
export function instanceUri(input: string): string | null {
  const text = input.trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return new URL(`instances/${text.toLowerCase()}`, config.bluecoreUrl).href
  }
  return isBluecore(text) ? text.replace(/\.cbd\.jsonld$/, '') : null
}

/**
 * Whether a URL belongs to this Blue Core. Only those requests carry the
 * cataloger's token, so a URI pasted from elsewhere can't collect it.
 */
export function isBluecore(url: string): boolean {
  try {
    return new URL(url).href.startsWith(config.bluecoreUrl)
  } catch {
    return false
  }
}
