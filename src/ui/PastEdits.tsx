import { useEffect, useState } from 'react'

import { clearEdits, listEdits, searchEdits, type PastEdit } from '../drafts/edits'
import { instanceHref, open } from './route'

const pageSize = 10

/**
 * The edits this cataloger saved to Blue Core from this browser, newest
 * first. On the start page it's every record, searchable a page at a time, and
 * can be cleared; in a record's history, it's that record's alone.
 */
export function PastEdits({ user, uri }: { user: string; uri?: string }) {
  const [edits, setEdits] = useState<PastEdit[] | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let live = true
    listEdits(user, uri).then(
      (edits) => live && setEdits(edits),
      () => live && setEdits([]),
    )
    return () => {
      live = false
    }
  }, [user, uri])

  if (!edits || edits.length === 0) return null

  if (uri !== undefined) {
    return (
      <section className="past-edits">
        <h2>Saved from this browser</h2>
        <ol className="results">
          {edits.map((edit) => (
            <Entry key={edit.id} edit={edit} />
          ))}
        </ol>
      </section>
    )
  }

  const found = searchEdits(edits, query)
  const pages = Math.max(1, Math.ceil(found.length / pageSize))
  const shown = Math.min(page, pages - 1)
  const first = shown * pageSize

  const clear = async () => {
    await clearEdits(user).catch(() => undefined)
    setClearing(false)
    setEdits([])
  }

  return (
    <section className="past-edits">
      <h2>Your saved edits</h2>
      <p className="muted past-about">Kept in this browser only, until you clear them.</p>
      {edits.length > pageSize && (
        <input
          type="search"
          aria-label="Search your saved edits"
          placeholder="Search by title, change or URI"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
        />
      )}
      {found.length === 0 && <p className="muted">None match.</p>}
      <ol className="results">
        {found.slice(first, first + pageSize).map((edit) => (
          <Entry key={edit.id} edit={edit} linked />
        ))}
      </ol>
      <div className="past-actions">
        {pages > 1 && (
          <span className="past-pages">
            <button type="button" className="secondary" disabled={shown === 0} onClick={() => setPage(shown - 1)}>
              Newer
            </button>
            <span className="muted">
              {first + 1}–{Math.min(first + pageSize, found.length)} of {found.length}
            </span>
            <button type="button" className="secondary" disabled={shown === pages - 1} onClick={() => setPage(shown + 1)}>
              Older
            </button>
          </span>
        )}
        {clearing ? (
          <span className="draft-actions" role="group" aria-label="Clear your saved edits?">
            Clear all {edits.length} from this browser?{' '}
            <button type="button" className="secondary" onClick={() => void clear()}>
              Clear
            </button>
            <button type="button" className="link" onClick={() => setClearing(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="link" onClick={() => setClearing(true)}>
            Clear history
          </button>
        )}
      </div>
    </section>
  )
}

function Entry({ edit, linked }: { edit: PastEdit; linked?: boolean }) {
  const changes = edit.changes.length
  return (
    <li>
      {linked && (
        <a
          href={instanceHref(edit.uri)}
          onClick={(event) => {
            event.preventDefault()
            open(edit.uri)
          }}
        >
          {edit.title || edit.uri}
        </a>
      )}
      <span className="muted draft-about">
        {written(edit)} · <time dateTime={edit.savedAt.toISOString()}>{edit.savedAt.toLocaleString()}</time>
      </span>
      {changes > 0 && (
        <details>
          <summary>{changes === 1 ? '1 change' : `${changes} changes`}</summary>
          <ul>
            {edit.changes.map((change) => (
              <li key={change.id}>{change.label}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

/** "Saved the Instance and Work", or what didn't go through. */
function written(edit: PastEdit): string {
  const saved = edit.resources.filter((r) => r.ok).map((r) => r.kind)
  const failed = edit.resources.filter((r) => !r.ok).map((r) => r.kind)
  const text = `Saved the ${saved.join(' and ')}`
  return failed.length > 0 ? `${text}; the ${failed.join(' and ')} didn’t save` : text
}
