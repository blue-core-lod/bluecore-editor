import type { ResourceSave } from '../api/save'

/**
 * What the last save did, resource by resource. A bounded description is
 * saved as separate writes, so one can succeed while the other fails, and
 * the cataloger needs to know which ("Work saved, Instance not saved").
 */
export function SaveReport({
  results,
  overwrite,
  reload,
  dismiss,
}: {
  results: readonly ResourceSave[]
  /** Save this resource again over the version now in Blue Core. */
  overwrite: (result: ResourceSave) => void
  /** Discard every unsaved change and open the description as Blue Core has it now. */
  reload: () => void
  dismiss: () => void
}) {
  const failed = results.filter((result) => !result.outcome.ok)
  if (results.length === 0) return null
  if (failed.length === 0) {
    return (
      <p className="saved" role="status">
        Saved the {results.map((result) => result.kind).join(' and the ')} to Blue Core.{' '}
        <button type="button" className="link" onClick={dismiss}>
          Dismiss
        </button>
      </p>
    )
  }
  return (
    <div className="note" role="alert">
      <ul className="save-results">
        {results.map((result) => (
          <li key={result.key}>
            {result.outcome.ok ? (
              <>The {result.kind} was saved.</>
            ) : (
              <>
                The {result.kind} wasn’t saved: {result.outcome.message}.
                {result.outcome.conflict && (
                  <span className="actions">
                    <button type="button" className="secondary" onClick={() => overwrite(result)}>
                      Save mine over theirs
                    </button>
                    <button type="button" className="secondary" onClick={reload}>
                      Reload from Blue Core, discarding my changes
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
