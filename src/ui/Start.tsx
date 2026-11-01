import { useEffect, useState, type SubmitEvent } from 'react'

import { searchInstances, type SearchHit } from '../api/bluecore'
import { instanceUri } from '../api/endpoints'
import { accessToken, useAuth } from '../auth/auth'
import { placeholderUri } from '../doc/blank'
import { newKey } from '../doc/model'
import { Drafts } from './Drafts'
import { Header } from './Header'
import { instanceHref, open } from './route'
import { useStoredFlag } from './storedFlag'
import { homeTour, startTour } from './tour'

/** Find an Instance to open (search Blue Core, or paste its URI or UUID), or start a new one. */
export function Start() {
  const user = useAuth().user?.profile.sub ?? 'anonymous'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ total: number; hits: SearchHit[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toured, setToured] = useStoredFlag('bluecore-editor.home-toured', false)
  // Taking the tour from here carries on in the editor with the next record opened.
  const [, setEditorToured] = useStoredFlag('bluecore-editor.toured', false)

  // The first visit gets a short tour; a moment's wait lets the unsaved records, read from the browser, appear first.
  useEffect(() => {
    if (toured) return
    const timer = window.setTimeout(() => startTour(homeTour, () => setToured(true)), 400)
    return () => window.clearTimeout(timer)
  }, [toured, setToured])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const uri = instanceUri(query)
    if (uri) {
      open(uri)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setResults(await searchInstances(query, accessToken()))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Header />
      <main className="page start">
        <div className="start-heading">
          <h1>Open a record</h1>
          <button
            type="button"
            className="link"
            onClick={() => {
              setEditorToured(false)
              startTour(homeTour, () => setToured(true))
            }}
          >
            Take a tour
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="find">Search Blue Core’s Instances, or paste an Instance URI or UUID</label>
          <div className="find">
            <input id="find" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
            <button type="submit" disabled={busy}>
              {busy ? 'Searching…' : 'Find'}
            </button>
          </div>
        </form>
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        {results && (
          <section aria-live="polite">
            <p className="muted">
              {results.total === 1 ? '1 Instance' : `${results.total} Instances`}
              {results.total > results.hits.length && `, showing the first ${results.hits.length}`}
            </p>
            <ul className="results">
              {results.hits.map((hit) => (
                <li key={hit.uri}>
                  <a
                    href={instanceHref(hit.uri)}
                    onClick={(event) => {
                      event.preventDefault()
                      open(hit.uri)
                    }}
                  >
                    {hit.title}
                  </a>
                  <span className="muted uri">{hit.uri}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="start-new">
          Or{' '}
          <button type="button" className="create" onClick={() => open(placeholderUri(newKey()))}>
            Start a new record
          </button>
        </p>
        <Drafts user={user} />
      </main>
    </>
  )
}
