import { useState } from 'react'

import type { Change } from '../doc/log'
import { PastEdits } from './PastEdits'

/**
 * The changes since the description was loaded, newest first, each with its
 * own undo. Undoing one that later changes depend on names them and offers to
 * undo them together, rather than leaving the description half-undone.
 */
export function History({
  changes,
  startedFrom,
  undo,
  discardAll,
  user,
  uri,
  recorded,
}: {
  changes: readonly Change[]
  startedFrom: string
  /** Throw every unsaved change away and read Blue Core's description again. */
  discardAll: () => void
  /** Undo these changes, or return the later ones that depend on them. */
  undo: (ids: string[]) => Change[] | null
  /** Whose saved edits to this record to list, and the record. */
  user: string
  uri: string
  /** How many saves have been recorded since the record opened, so a new one shows. */
  recorded: number
}) {
  const [blocked, setBlocked] = useState<{ change: Change; dependents: Change[] } | null>(null)

  const tryUndo = (change: Change) => {
    const dependents = undo([change.id])
    setBlocked(dependents ? { change, dependents } : null)
  }

  return (
    <div className="history" role="dialog" aria-label="Edit history">
      <h2>Changes since loading</h2>
      {changes.length === 0 && <p className="muted">No changes yet.</p>}
      <ol>
        {changes.toReversed().map((change) => (
          <li key={change.id}>
            <div>
              <span>{change.label}</span>
              <time dateTime={change.at}>{new Date(change.at).toLocaleTimeString()}</time>
            </div>
            <button type="button" className="secondary" onClick={() => tryUndo(change)}>
              Undo
            </button>
            {blocked?.change.id === change.id && (
              <div className="note" role="alert">
                <p>Later changes depend on this one:</p>
                <ul>
                  {blocked.dependents.map((dependent) => (
                    <li key={dependent.id}>{dependent.label}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    undo([change.id, ...blocked.dependents.map((dependent) => dependent.id)])
                    setBlocked(null)
                  }}
                >
                  Undo all {blocked.dependents.length + 1}
                </button>{' '}
                <button type="button" className="secondary" onClick={() => setBlocked(null)}>
                  Leave as is
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="muted started">{startedFrom}</p>
      {changes.length > 0 && (
        <button type="button" className="secondary" onClick={discardAll}>
          Discard all unsaved changes
        </button>
      )}
      <PastEdits key={recorded} user={user} uri={uri} />
    </div>
  )
}
