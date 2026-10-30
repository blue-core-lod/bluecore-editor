import { useSyncExternalStore } from 'react'

import { isPlaceholder, placeholderId, placeholderUri } from '../doc/blank'

/**
 * The editor's one piece of routing: which Instance is open, as ?instance=<uri>,
 * so a description can be bookmarked and the back button works. A new one, not
 * in Blue Core yet, is ?new=<id>, standing for its placeholder URI.
 */

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}

function current(): string | null {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('new')
  return params.get('instance') ?? (id ? placeholderUri(id) : null)
}

export function useOpenInstance(): string | null {
  return useSyncExternalStore(subscribe, current)
}

export function instanceHref(uri: string | null): string {
  const url = new URL(window.location.href)
  const params: Record<string, string> = !uri ? {} : isPlaceholder(uri) ? { new: placeholderId(uri) } : { instance: uri }
  url.search = new URLSearchParams(params).toString()
  return url.href
}

export function open(uri: string | null): void {
  window.history.pushState(null, '', instanceHref(uri))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Open another Instance in place of this one, as when a new description has been created and has its URI. */
export function replace(uri: string): void {
  window.history.replaceState(null, '', instanceHref(uri))
  window.dispatchEvent(new PopStateEvent('popstate'))
}
