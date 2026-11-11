import { signIn, useAuth } from '../auth/auth'
import { Editor } from './Editor'
import { Fields } from './Fields'
import { Header } from './Header'
import { Start } from './Start'
import { UpdateNotice } from './UpdateNotice'
import { useFieldsKind, useOpenInstance } from './route'

export function App() {
  const { user, error } = useAuth()
  const uri = useOpenInstance()
  const fields = useFieldsKind()

  // Needs no Blue Core, so it's open without signing in and can be shared.
  if (fields !== null) {
    return (
      <>
        <UpdateNotice />
        <Fields kind={fields} />
      </>
    )
  }
  if (!user) {
    return (
      <>
        <UpdateNotice />
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
  return (
    <>
      <UpdateNotice />
      {uri ? <Editor key={uri} uri={uri} /> : <Start />}
    </>
  )
}
