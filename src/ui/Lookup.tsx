import { useEffect, useId, useState, type KeyboardEvent } from 'react'

import { searchSource, type Hit } from '../lookup/qa'
import type { Source } from '../lookup/sources'
import { isUri } from './labels'

type SourceState = { state: 'loading' } | { state: 'done'; hits: Hit[] } | { state: 'failed' }

interface Option extends Hit {
  id: string
  source: string
}

/** Wait this long after the last keystroke before searching. */
const pause = 300

/**
 * Finding the entity a link points to: a search across the field's sources,
 * with results as each source answers. A source that fails says so, since a
 * missing result looks the same as "no such entity". Pasting a URI still
 * works, for an entity no source here knows.
 */
export function Lookup({
  label,
  sources,
  onPick,
  onCancel,
}: {
  /** What the field is called, such as "Subject". */
  label: string
  sources: Source[]
  onPick: (hit: Hit) => void
  onCancel: () => void
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [pastedLabel, setPastedLabel] = useState('')
  const [results, setResults] = useState<Record<string, SourceState>>({})
  const [active, setActive] = useState(0)
  const [attempt, setAttempt] = useState(0)

  const text = query.trim()
  const pasted = isUri(text)
  const searching = !pasted && text.length >= 2

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setResults(Object.fromEntries(sources.map((source) => [source.label, { state: 'loading' }])))
      for (const source of sources) {
        searchSource(source, text, controller.signal).then(
          (hits) => setResults((current) => ({ ...current, [source.label]: { state: 'done', hits } })),
          () => {
            if (!controller.signal.aborted) {
              setResults((current) => ({ ...current, [source.label]: { state: 'failed' } }))
            }
          },
        )
      }
    }, pause)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searching, text, sources, attempt])

  const seen = new Set<string>()
  const options: Option[] = searching
    ? sources.flatMap((source) => {
        const result = results[source.label]
        if (result?.state !== 'done') return []
        return result.hits
          .filter((hit) => !seen.has(hit.uri) && seen.add(hit.uri))
          .map((hit) => ({ ...hit, id: `${listId}-${hit.uri}`, source: source.label }))
      })
    : []
  const current = options[Math.min(active, options.length - 1)]

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onCancel()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    }
    if (event.key === 'Enter') {
      if (pasted) onPick({ uri: text, label: pastedLabel.trim() })
      else if (current) onPick(current)
    }
  }

  return (
    <div className="lookup">
      <div className="adding">
        <input
          role="combobox"
          aria-label={`Find ${label.toLowerCase()}`}
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={current?.id}
          aria-autocomplete="list"
          placeholder={
            sources.length > 0
              ? `Find ${label.toLowerCase()} in ${sources.map((source) => source.label).join(' and ')}, or paste a URI`
              : `Paste the URI of the ${label.toLowerCase()}`
          }
          value={query}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        {pasted && (
          <>
            <input
              aria-label={`${label} label`}
              placeholder="Label"
              value={pastedLabel}
              onChange={(event) => setPastedLabel(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="button" className="secondary" onClick={() => onPick({ uri: text, label: pastedLabel.trim() })}>
              Add
            </button>
          </>
        )}
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {searching && (
        <p className="lookup-sources" aria-live="polite">
          {sources.map((source) => {
            const result = results[source.label]
            return (
              <span key={source.label} className={`lookup-source ${result?.state ?? 'loading'}`}>
                {source.label}{' '}
                {result?.state === 'done' ? (
                  result.hits.length
                ) : result?.state === 'failed' ? (
                  <>
                    didn&rsquo;t respond{' '}
                    <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
                      Retry
                    </button>
                  </>
                ) : (
                  '…'
                )}
              </span>
            )
          })}
        </p>
      )}
      {options.length > 0 && (
        <>
          <ul className="lookup-results" role="listbox" id={listId} aria-label={`${label} results`}>
            {options.map((option) => (
              <li
                key={option.id}
                id={option.id}
                role="option"
                aria-selected={option === current}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(option)}
                onMouseEnter={() => setActive(options.indexOf(option))}
              >
                <span>{option.label}</span>
                <span className="source">{option.source}</span>
              </li>
            ))}
          </ul>
          <p className="muted hint">Up and down to move, Enter to choose</p>
        </>
      )}
    </div>
  )
}
