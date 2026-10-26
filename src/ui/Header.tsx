import type { ReactNode } from 'react'

import { displayName, signOut, useAuth } from '../auth/auth'
import { instanceHref, open } from './route'

export function Header({ children }: { children?: ReactNode }) {
  const { user } = useAuth()
  return (
    <header className="app-header">
      <a
        className="brand"
        href={instanceHref(null)}
        onClick={(event) => {
          event.preventDefault()
          open(null)
        }}
      >
        Blue Core
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
