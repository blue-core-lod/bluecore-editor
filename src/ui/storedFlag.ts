import { useCallback, useState } from 'react'

/**
 * A per-browser preference. Storage can be missing or refuse (a private
 * window, blocked site data), so it falls back to the default quietly.
 */
export function useStoredFlag(name: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(name)
      return stored === null ? initial : stored === 'true'
    } catch {
      return initial
    }
  })
  // The same function every render, so effects that depend on it don't re-run.
  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      try {
        window.localStorage.setItem(name, String(next))
      } catch {
        // Not remembered beyond this page; nothing else depends on it.
      }
    },
    [name],
  )
  return [value, set]
}
