import { useEffect, useState } from 'react'

import { isPlaceholder } from '../doc/blank'
import { deleteDraft, listDrafts, restore, type Draft } from '../drafts/drafts'
import { titleOf } from './labels'
import { instanceHref, open } from './route'

/**
 * The descriptions with unsaved changes in this browser, so work can be picked
 * up where it was left. A new description has no other way back to it: until
 * it's saved, Blue Core has nothing to search for.
 */
export function Drafts({ user }: { user: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [discarding, setDiscarding] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // A browser that keeps no drafts has none to list; the editor says so where it matters.
    listDrafts(user).then(
      (drafts) => live && setDrafts(drafts),
      () => live && setDrafts([]),
    )
    return () => {
      live = false
    }
  }, [user])

  if (!drafts || drafts.length === 0) return null

  const discard = async (draft: Draft) => {
    await deleteDraft(user, draft.uri).catch(() => undefined)
    setDiscarding(null)
    setDrafts((drafts) => drafts?.filter((other) => other.id !== draft.id) ?? null)
  }

  return (
    <section className="drafts">
      <h2>Unsaved descriptions</h2>
      <ul className="results">
        {drafts.map((draft) => {
          const changes = draft.log.changes.length
          const counted = changes === 1 ? '1 unsaved change' : `${changes} unsaved changes`
          return (
            <li key={draft.id}>
              <a
                href={instanceHref(draft.uri)}
                onClick={(event) => {
                  event.preventDefault()
                  open(draft.uri)
                }}
              >
                {titleOf(restore(draft)?.current ?? draft.log.base)}
              </a>
              <span className="muted draft-about">
                {isPlaceholder(draft.uri) ? 'New, not in Blue Core yet' : 'Edits to a description in Blue Core'} ·{' '}
                {counted} · {draft.updatedAt.toLocaleString()}
              </span>
              {discarding === draft.id ? (
                <span className="draft-actions" role="group" aria-label="Discard this draft?">
                  {isPlaceholder(draft.uri) ? 'Discard this new description?' : `Discard ${counted}?`}{' '}
                  <button type="button" className="secondary" onClick={() => void discard(draft)}>
                    Discard
                  </button>
                  <button type="button" className="link" onClick={() => setDiscarding(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <span className="draft-actions">
                  <button type="button" className="link" onClick={() => setDiscarding(draft.id)}>
                    Discard
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
