import { useEffect, useRef, useState, type ReactNode } from 'react'

import { displayName, signOut, useAuth } from '../auth/auth'
import { clearEdits, listEdits } from '../drafts/edits'
import { instanceHref, open } from './route'

export function Header({ children }: { children?: ReactNode }) {
  const { user } = useAuth()
  const header = useRef<HTMLElement>(null)
  // How many saved edits this browser holds for whoever is signing out, once they ask to.
  const [leaving, setLeaving] = useState<number | null>(null)

  // The header sticks to the top of the page and wraps as the page narrows,
  // so what sticks below it, like the context panel, needs its height.
  useEffect(() => {
    const element = header.current
    if (!element) return
    const root = document.documentElement
    const observer = new ResizeObserver(() => root.style.setProperty('--header-height', `${element.offsetHeight}px`))
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--header-height')
    }
  }, [])

  return (
    <header ref={header} className="app-header">
      <a
        className="brand"
        href={instanceHref(null)}
        onClick={(event) => {
          event.preventDefault()
          open(null)
        }}
      >
        <img src={`${import.meta.env.BASE_URL}blue-core-logo.png`} alt="Blue Core" height={32} />
        <span className="app-name">Editor</span>
      </a>
      <div className="header-main">{children}</div>
      {user && (
        <div className="user">
          <span>{displayName(user)}</span>
          {leaving === null ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                // On a shared machine the next person shouldn't find what this one edited, so offer to clear it.
                void listEdits(user.profile.sub).then(
                  (edits) => (edits.length > 0 ? setLeaving(edits.length) : signOut()),
                  () => signOut(),
                )
              }}
            >
              Sign out
            </button>
          ) : (
            <span className="sign-out" role="group" aria-label="Sign out">
              Clear your {leaving === 1 ? 'saved edit' : `${leaving} saved edits`} from this browser too?
              <button
                type="button"
                className="secondary"
                onClick={() => void clearEdits(user.profile.sub).finally(() => void signOut())}
              >
                Clear and sign out
              </button>
              <button type="button" className="secondary" onClick={() => void signOut()}>
                Keep and sign out
              </button>
              <button type="button" className="link" onClick={() => setLeaving(null)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      )}
    </header>
  )
}
