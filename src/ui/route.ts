import { useSyncExternalStore } from 'react'

import { isPlaceholder, placeholderId, placeholderUri } from '../doc/blank'

/**
 * The editor's routing: which Instance is open, as ?instance=<uri>, so a
 * description can be bookmarked and the back button works. A new one, not in
 * Blue Core yet, is ?new=<id>, standing for its placeholder URI. The fields a
 * kind of record offers are ?fields=<kind>, and ?fields alone lists the kinds.
 * In the dev build, ?transcribe-test is the test of transcribing from photos.
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

function currentFields(): string | null {
  return new URLSearchParams(window.location.search).get('fields')
}

/** The kind whose fields are being shown: "" for the list of kinds, null when the page isn't showing fields. */
export function useFieldsKind(): string | null {
  return useSyncExternalStore(subscribe, currentFields)
}

export function fieldsHref(kind: string): string {
  const url = new URL(window.location.href)
  url.search = new URLSearchParams({ fields: kind }).toString()
  return url.href
}

export function openFields(kind: string): void {
  window.history.pushState(null, '', fieldsHref(kind))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function currentTranscribeTest(): boolean {
  return new URLSearchParams(window.location.search).has('transcribe-test')
}

export function useTranscribeTest(): boolean {
  return useSyncExternalStore(subscribe, currentTranscribeTest)
}
