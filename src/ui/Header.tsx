import { useEffect, useRef, type ReactNode } from 'react'

import { displayName, signOut, useAuth } from '../auth/auth'
import { instanceHref, open } from './route'

export function Header({ children }: { children?: ReactNode }) {
  const { user } = useAuth()
  const header = useRef<HTMLElement>(null)

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
      </a>
      <div className="header-main">{children}</div>
      {user && (
        <div className="user">
          <span>{displayName(user)}</span>
          <button type="button" className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
