import { useEffect } from 'react'

import type { Change } from '../doc/log'

/**
 * Asked when an edit would change a Work other Instances share: the one moment
 * the boundary between resources decides the outcome, so the one moment the
 * editor makes it explicit (design.md, Scope prompts). Answering "all" holds
 * for the rest of the session, so later edits to the Work go through quietly.
 *
 * Splitting off a new Work for this Instance, the mockup's second choice, is
 * still to come.
 */
export function ScopePrompt({
  change,
  others,
  workUri,
  changeAll,
  cancel,
}: {
  change: Change
  /** How many other Instances share the Work. */
  others: number
  workUri: string
  changeAll: () => void
  cancel: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  return (
    <div className="scrim">
      <div className="scope-prompt" role="dialog" aria-modal="true" aria-labelledby="scope-title">
        <h2 id="scope-title">
          {others === 1 ? '1 other Instance shares this Work' : `${others} other Instances share this Work`}
        </h2>
        <p>Your change describes the Work itself, so it would appear in every edition’s record.</p>
        <p className="scope-change">
          <span className="muted">Your change</span> {change.label}
        </p>
        <button type="button" className="scope-choice" onClick={changeAll} autoFocus>
          <strong>Change the Work for all {others + 1} Instances</strong>
          <span>Right when the change is true of the work in every edition.</span>
        </button>
        <p className="scope-more">
          <a href={workUri} target="_blank" rel="noreferrer">
            See the Work and its Instances in Blue Core
          </a>
          <button type="button" className="secondary" onClick={cancel}>
            Cancel change
          </button>
        </p>
      </div>
    </div>
  )
}
