import { useSyncExternalStore } from 'react'

/**
 * The editor's one piece of routing: which Instance is open, as ?instance=<uri>,
 * so a description can be bookmarked and the back button works.
 */

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}

function current(): string | null {
  return new URLSearchParams(window.location.search).get('instance')
}

export function useOpenInstance(): string | null {
  return useSyncExternalStore(subscribe, current)
}

export function instanceHref(uri: string | null): string {
  const url = new URL(window.location.href)
  url.search = uri ? new URLSearchParams({ instance: uri }).toString() : ''
  return url.href
}

export function open(uri: string | null): void {
  window.history.pushState(null, '', instanceHref(uri))
  window.dispatchEvent(new PopStateEvent('popstate'))
}
