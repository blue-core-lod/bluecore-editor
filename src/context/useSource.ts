import { useEffect, useState } from 'react'

/** One source's answer, as it arrives: the panel shows each source when it's ready. */
export type Fetched<T> = { state: 'loading' } | { state: 'done'; value: T } | { state: 'failed'; error: string }

/**
 * Answers already fetched, by source and key, for this page. Choosing between
 * two names means going back and forth, and the sources shouldn't be asked
 * again each time. A failure isn't kept, so the next look tries again.
 */
const cache = new Map<string, Promise<unknown>>()

export function useSource<T>(
  name: string,
  key: string | null | undefined,
  load: (key: string) => Promise<T>,
): Fetched<T> | null {
  const id = key ? `${name} ${key}` : null
  const [result, setResult] = useState<{ id: string; fetched: Fetched<T> } | null>(null)

  useEffect(() => {
    if (!id || !key) return
    let current = true
    let pending = cache.get(id) as Promise<T> | undefined
    if (!pending) {
      // Left to finish when the panel moves on: the answer is still worth keeping.
      pending = load(key)
      cache.set(id, pending)
      pending.catch(() => cache.delete(id))
    }
    pending.then(
      (value) => current && setResult({ id, fetched: { state: 'done', value } }),
      (error: unknown) =>
        current && setResult({ id, fetched: { state: 'failed', error: error instanceof Error ? error.message : String(error) } }),
    )
    return () => {
      current = false
    }
  }, [id, key, load])

  if (!id) return null
  return result?.id === id ? result.fetched : { state: 'loading' }
}
