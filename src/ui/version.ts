import { useEffect, useState } from 'react'

/** The commit this build was made from, as /editor/health reports it; "dev" when it wasn't built for deploying. */
export const version = import.meta.env.VITE_VERSION || 'dev'

const every = 10 * 60 * 1000

/**
 * Whether a newer build has been deployed since this page loaded: checked when
 * the tab comes back into view, and every ten minutes while it's open. A dev
 * server has no health check, and reloads itself.
 */
export function useNewVersion(): boolean {
  const [newer, setNewer] = useState(false)

  useEffect(() => {
    if (version === 'dev' || newer) return
    let live = true
    const check = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}health`, { cache: 'no-store' })
        if (!response.ok) return
        const deployed = ((await response.json()) as { version?: string }).version
        if (live && deployed && deployed !== 'dev' && deployed !== version) setNewer(true)
      } catch {
        // Offline, or the server is restarting: ask again later.
      }
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onShow)
    const timer = setInterval(() => void check(), every)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onShow)
      clearInterval(timer)
    }
  }, [newer])

  return newer
}
