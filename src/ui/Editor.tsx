import { useCallback, useEffect, useMemo, useState } from 'react'

import { loadBounded, type Loaded } from '../api/bluecore'
import { afterSave, saveDescription, type ResourceSave, type SaveState } from '../api/save'
import { accessToken, useAuth } from '../auth/auth'
import { blankDescription, isPlaceholder } from '../doc/blank'
import { record as recordChange, undo, type Change } from '../doc/log'
import { getNode, normalize } from '../doc/model'
import { ConflictError } from '../doc/patch'
import { changesWork, otherInstances, principals, snapshot, unsaved } from '../doc/resources'
import { deleteDraft, readDraft, restore, writeDraft, type Draft } from '../drafts/drafts'
import { getValidators } from '../schema/validate'
import { ContextPanel } from './ContextPanel'
import type { Previewed } from './context'
import { Description } from './Description'
import { Header } from './Header'
import { History } from './History'
import { refLabels, refName, titleOf } from './labels'
import { primerUrl } from './presentation'
import { replace } from './route'
import { SaveReport } from './SaveReport'
import { ScopePrompt } from './ScopePrompt'

interface Session extends SaveState {
  loadedAt: Date
  savedAt: Date | null
  /** Where Blue Core's description departs from bibframe-json's bounded shape. */
  shapeProblems: number
}

/** A draft picked up on opening: how much it held, and whether Blue Core has moved on since. */
interface Restored {
  changes: number
  updatedAt: Date
  stale: boolean
}

/** One Instance, open for editing. Mounted afresh for each Instance (keyed by URI). */
export function Editor({ uri }: { uri: string }) {
  const user = useAuth().user?.profile.sub ?? 'anonymous'
  const [session, setSession] = useState<Session | null>(null)
  const [restored, setRestored] = useState<Restored | null>(null)
  // Whether unsaved work survives a reload; IndexedDB can be missing or refuse.
  const [draftsKept, setDraftsKept] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  /** Something that went wrong without stopping the editor, said in a sentence. */
  const [problem, setProblem] = useState<string | null>(null)
  const [hints, setHints] = useStoredFlag('bluecore-editor.hints', true)
  const [explained, setExplained] = useStoredFlag('bluecore-editor.hints-explained', false)
  const [panel, setPanel] = useState<'history' | 'hints' | null>(explained ? null : 'hints')
  const [saving, setSaving] = useState(false)
  const [report, setReport] = useState<ResourceSave[] | null>(null)
  /** The linked entity in the context panel, and the lookup result shown there instead while it's highlighted. */
  const [selected, setSelected] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<Previewed | null>(null)
  // Bumped to read the description from Blue Core again, discarding the session.
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let live = true
    const draft = readDraft(user, uri).catch(() => {
      if (live) setDraftsKept(false)
      return null
    })
    // A new description starts empty, and isn't asked of Blue Core until it's saved.
    const loading: Promise<Loaded> = isPlaceholder(uri)
      ? Promise.resolve({ json: blankDescription(uri), etags: { instance: null, work: null } })
      : loadBounded(uri, accessToken())
    Promise.all([loading, draft])
      .then(([loaded, draft]) => {
        if (!live) return
        const fresh = sessionFrom(loaded, null)
        const state = draft && restore(draft)
        if (draft && !state) setProblem('Your unsaved changes to this record couldn’t be restored.')
        const resumed = draft && state?.log.changes.length ? resume(draft, state, loaded, fresh) : null
        setSession(resumed?.session ?? fresh)
        setRestored(resumed?.restored ?? null)
      })
      .catch((error: unknown) => {
        if (live) setFailure(error instanceof Error ? error.message : String(error))
      })
    return () => {
      live = false
    }
  }, [uri, user, generation])

  const changes = session?.log.changes.length ?? 0
  const pending = useMemo(() => (session ? unsaved(session.current, session.saved).length : 0), [session])

  // Keep unsaved work in the browser as it happens, and let it go once saved.
  useEffect(() => {
    if (!session) return
    // A new description no one has touched isn't kept: it would only clutter the list of drafts.
    const keep = changes > 0 || (pending > 0 && !isPlaceholder(uri))
    const write = keep ? writeDraft(user, uri, session) : deleteDraft(user, uri)
    write.catch(() => setDraftsKept(false))
  }, [session, changes, pending, user, uri])

  // Only when drafts can't be kept does leaving the page lose anything.
  useEffect(() => {
    if (draftsKept || changes === 0) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draftsKept, changes])

  // An edit to a Work other Instances share waits here until the cataloger says
  // it's meant for all of them; once they have, the rest go through.
  const [asking, setAsking] = useState<Change | null>(null)
  const [sharedAgreed, setSharedAgreed] = useState(false)
  // Bumped when an edit is cancelled, so fields drop what was typed for it.
  const [formKey, setFormKey] = useState(0)

  const apply = useCallback((change: Change) => {
    setSession((session) => {
      if (!session) return session
      try {
        return { ...session, ...recordChange(session.log, session.current, change) }
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error
        queueMicrotask(() => setProblem(`That edit didn’t apply: ${error.message}.`))
        return session
      }
    })
  }, [])

  const record = useCallback(
    (change: Change) => {
      const doc = session?.current
      if (doc && !sharedAgreed && changesWork(doc, change) && otherInstances(doc).length > 0) setAsking(change)
      else apply(change)
    },
    [session, sharedAgreed, apply],
  )

  const undoChanges = (ids: string[]): Change[] | null => {
    if (!session) return null
    const result = undo(session.log, ids)
    if (!result.ok) return result.dependents
    setSession({ ...session, log: result.log, current: result.current })
    return null
  }

  const save = async (state: SaveState) => {
    setSaving(true)
    setReport(null)
    try {
      const results = await saveDescription(state, accessToken())
      setSession((session) => {
        if (!session) return session
        const next = afterSave(session, results)
        return results.some((result) => result.outcome.ok) ? { ...next, savedAt: new Date() } : next
      })
      setReport(results)
      // Blue Core adds to a description as it saves it (the status in its
      // admin metadata, for one), so once everything is saved the editor reads
      // it back rather than keep a copy that would send stale values next time.
      // Not if an edit was made meanwhile: that edit would be lost.
      if (results.every((result) => result.outcome.ok)) {
        // A new description now has its URI: open it there, which reads it back.
        const created = results.find((result) => result.kind === 'Instance' && result.outcome.ok && result.outcome.created)
        if (created) {
          await deleteDraft(user, uri).catch(() => setDraftsKept(false))
          replace(created.uri)
          return
        }
        const loaded = await loadBounded(uri, accessToken())
        const savedAt = new Date()
        setSession((session) => (session && session.log.changes.length === 0 ? sessionFrom(loaded, savedAt) : session))
      }
    } catch (error) {
      setProblem(
        `Saved, but couldn’t read the record back from Blue Core: ${error instanceof Error ? error.message : String(error)}. Reload before editing further.`,
      )
    } finally {
      setSaving(false)
    }
  }

  const overwrite = (result: ResourceSave) => {
    if (!session || result.outcome.ok || !result.outcome.conflict) return
    void save({ ...session, etags: { ...session.etags, [result.key]: result.outcome.etag } })
  }

  /** Discard every unsaved change, the draft with them, and read Blue Core's description again. */
  const reload = async () => {
    setSession(null)
    setReport(null)
    setRestored(null)
    await deleteDraft(user, uri).catch(() => setDraftsKept(false))
    setGeneration((generation) => generation + 1)
  }

  if (failure) {
    return (
      <>
        <Header />
        <main className="page">
          <p className="note" role="alert">
            Couldn’t open {uri}: {failure}
          </p>
        </main>
      </>
    )
  }
  if (!session) {
    return (
      <>
        <Header />
        <main className="page">
          <p className="muted">Opening {uri}…</p>
        </main>
      </>
    )
  }

  const { work } = principals(session.current)
  const workUri = work ? getNode(session.current, work).keywords['@id'] : undefined
  const toggle = (next: 'history' | 'hints') => setPanel(panel === next ? null : next)

  return (
    <>
      <Header>
        <div className="title-block">
          <h1>{titleOf(session.current)}</h1>
          <p className="muted">
            {isPlaceholder(uri) ? (
              <>A new record, not in Blue Core until it’s saved</>
            ) : (
              <>
                <a href={uri} target="_blank" rel="noreferrer">
                  Instance
                </a>
                {typeof workUri === 'string' && !isPlaceholder(workUri) && (
                  <>
                    {' of '}
                    <a href={workUri} target="_blank" rel="noreferrer">
                      Work
                    </a>
                  </>
                )}{' '}
                in Blue Core
              </>
            )}
          </p>
        </div>
        <div className="controls">
          <button
            type="button"
            className="secondary"
            aria-expanded={panel === 'history'}
            onClick={() => toggle('history')}
          >
            {changes === 0 ? 'No unsaved changes' : changes === 1 ? '1 unsaved change' : `${changes} unsaved changes`}
          </button>
          <button type="button" disabled={saving || pending === 0} onClick={() => void save(session)}>
            {saving ? 'Saving…' : 'Save to Blue Core'}
          </button>
          <span className="hints-control">
            <button
              type="button"
              role="switch"
              aria-checked={hints}
              className="switch"
              onClick={() => setHints(!hints)}
            >
              Hints
            </button>
            <button
              type="button"
              className="secondary round"
              aria-label="What hints show"
              aria-expanded={panel === 'hints'}
              onClick={() => toggle('hints')}
            >
              ?
            </button>
          </span>
        </div>
      </Header>
      {panel === 'history' && (
        <History
          changes={session.log.changes}
          startedFrom={
            session.savedAt
              ? `Saved to Blue Core at ${session.savedAt.toLocaleTimeString()}`
              : isPlaceholder(uri)
                ? `Started at ${session.loadedAt.toLocaleTimeString()}`
                : `Opened from Blue Core at ${session.loadedAt.toLocaleTimeString()}`
          }
          undo={undoChanges}
          discardAll={() => {
            setPanel(null)
            void reload()
          }}
        />
      )}
      {panel === 'hints' && (
        <div className="explainer" role="dialog" aria-label="What hints show">
          <p>
            <strong>Hints</strong> show the MARC field each value corresponds to, linked to the MARC 21 bibliographic
            format, and whether the value is saved with the <span className="badge badge-work">Work</span> or the{' '}
            <span className="badge badge-instance">Instance</span>. The{' '}
            <a href={primerUrl} target="_blank" rel="noreferrer">
              BIBFRAME Primer
            </a>{' '}
            explains the difference.
          </p>
          <button
            type="button"
            onClick={() => {
              setExplained(true)
              setPanel(null)
            }}
          >
            Got it
          </button>
        </div>
      )}
      <main className={selected || previewing ? 'page with-context' : 'page'}>
        {session.shapeProblems > 0 && (
          <p className="note">
            This record doesn’t quite have bibframe-json’s bounded shape ({session.shapeProblems}{' '}
            {session.shapeProblems === 1 ? 'problem' : 'problems'}), so it may not save cleanly.
          </p>
        )}
        {restored && (
          <div className="note" role="status">
            Restored {restored.changes === 1 ? '1 unsaved change' : `${restored.changes} unsaved changes`} from{' '}
            {restored.updatedAt.toLocaleString()}.
            {restored.stale &&
              ' Blue Core’s copy has changed since, so saving will ask whether to keep your version or theirs.'}{' '}
            <button type="button" className="link" onClick={() => setRestored(null)}>
              Keep them
            </button>{' '}
            <button type="button" className="link" onClick={() => void reload()}>
              Discard them
            </button>
          </div>
        )}
        {!draftsKept && (
          <p className="note">
            This browser isn’t keeping drafts, so unsaved changes will be lost if you leave the page.
          </p>
        )}
        {report && (
          <SaveReport
            results={report}
            overwrite={overwrite}
            reload={() => void reload()}
            dismiss={() => setReport(null)}
          />
        )}
        {problem && (
          <p className="note" role="alert">
            {problem}{' '}
            <button type="button" className="link" onClick={() => setProblem(null)}>
              Dismiss
            </button>
          </p>
        )}
        <div className="workspace">
          <Description
            key={formKey}
            doc={session.current}
            hints={hints}
            record={record}
            selected={selected}
            select={setSelected}
            preview={setPreviewing}
          />
          {previewing ? (
            <ContextPanel
              key="previewing"
              uri={previewing.uri}
              name={previewing.label}
              previewing
              hints={hints}
              close={() => {
                setPreviewing(null)
                setSelected(null)
              }}
            />
          ) : (
            selected && (
              <ContextPanel
                key="selected"
                uri={selected}
                name={refName(selected, refLabels(session.current))}
                hints={hints}
                close={() => setSelected(null)}
              />
            )
          )}
        </div>
        {asking && typeof workUri === 'string' && (
          <ScopePrompt
            change={asking}
            others={otherInstances(session.current).length}
            workUri={workUri}
            changeAll={() => {
              setSharedAgreed(true)
              apply(asking)
              setAsking(null)
            }}
            cancel={() => {
              setAsking(null)
              setFormKey((key) => key + 1)
            }}
          />
        )}
      </main>
    </>
  )
}

/**
 * Pick up a draft against the description as Blue Core has it now. The draft
 * keeps the versions it was made against, so if Blue Core has moved on, saving
 * it is refused and the cataloger chooses, rather than it silently winning.
 * Its keys are its own, so the versions are compared resource by resource.
 */
function resume(draft: Draft, state: SaveState, loaded: Loaded, fresh: Session): { session: Session; restored: Restored } {
  const { instance, work } = principals(state.current)
  const stale =
    state.etags[instance] !== loaded.etags.instance || (work !== null && state.etags[work] !== loaded.etags.work)
  return {
    session: { ...state, loadedAt: draft.loadedAt, savedAt: null, shapeProblems: fresh.shapeProblems },
    restored: { changes: state.log.changes.length, updatedAt: draft.updatedAt, stale },
  }
}

function sessionFrom(loaded: Loaded, savedAt: Date | null): Session {
  const doc = normalize(loaded.json)
  const { bounded } = getValidators()
  const { instance, work } = principals(doc)
  return {
    log: { base: doc, changes: [] },
    current: doc,
    // Blue Core holds nothing of a new description, so all of it is unsaved.
    saved: isPlaceholder(loaded.json['@id']) ? {} : snapshot(doc),
    etags: { [instance]: loaded.etags.instance, ...(work ? { [work]: loaded.etags.work } : {}) },
    loadedAt: new Date(),
    savedAt,
    shapeProblems: bounded(loaded.json) ? 0 : (bounded.errors?.length ?? 1),
  }
}

/**
 * A per-browser preference. Storage can be missing or refuse (a private
 * window, blocked site data), so it falls back to the default quietly.
 */
function useStoredFlag(name: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(name)
      return stored === null ? initial : stored === 'true'
    } catch {
      return initial
    }
  })
  const set = (next: boolean) => {
    setValue(next)
    try {
      window.localStorage.setItem(name, String(next))
    } catch {
      // Not remembered beyond this page; nothing else depends on it.
    }
  }
  return [value, set]
}
