import { signIn, useAuth } from '../auth/auth'
import { Editor } from './Editor'
import { Header } from './Header'
import { Start } from './Start'
import { useOpenInstance } from './route'

export function App() {
  const { user, error } = useAuth()
  const uri = useOpenInstance()

  if (!user) {
    return (
      <>
        <Header />
        <main className="page start">
          <h1>Blue Core record editor</h1>
          <p>Sign in with your Blue Core account to open and edit records.</p>
          {error && (
            <p className="note" role="alert">
              Sign-in didn’t work: {error}
            </p>
          )}
          <button type="button" onClick={() => void signIn()}>
            Sign in
          </button>
        </main>
      </>
    )
  }
  return uri ? <Editor key={uri} uri={uri} /> : <Start />
}
