import { useEffect, useId, useState, type KeyboardEvent } from 'react'

import { hasContext, lcAuthorityId } from '../context/lc'
import { useSource } from '../context/useSource'
import { wikidataDescriptions } from '../context/wikidata'
import { browses, searchSource, type Hit } from '../lookup/qa'
import { isLocal, type Source } from '../lookup/sources'
import { useDescription } from './context'
import { isUri } from './labels'

type SourceState = { state: 'loading' } | { state: 'done'; hits: Hit[] } | { state: 'failed' }

interface Option extends Hit {
  id: string
  source: string
}

function hitsOf(result: SourceState | undefined): Hit[] {
  return result?.state === 'done' ? result.hits : []
}

/** Wait this long after the last keystroke before searching a remote source. */
const pause = 300

/** Wait this long on a result before showing it in the context panel, so moving through the list doesn't ask the sources about each. */
const dwell = 350

/**
 * Finding the entity a link points to: a search across the field's sources,
 * with results as each source answers. A source that fails says so, since a
 * missing result looks the same as "no such entity". Pasting a URI still
 * works, for an entity no source here knows.
 */
export function Lookup({
  label,
  sources,
  already,
  onPick,
  onCancel,
}: {
  /** What the field is called, such as "Subject". */
  label: string
  sources: Source[]
  /** URIs the field already links to, not offered again. */
  already: ReadonlySet<string>
  onPick: (hit: Hit) => void
  onCancel: () => void
}) {
  const { hints, select, preview } = useDescription()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [pastedLabel, setPastedLabel] = useState('')
  const [results, setResults] = useState<Record<string, SourceState>>({})
  const [active, setActive] = useState(0)
  const [attempt, setAttempt] = useState(0)

  const text = query.trim()
  const pasted = isUri(text)
  // A picklist (only vendored vocabularies) answers at once, and from the first keystroke, or none.
  const picklist = sources.length > 0 && sources.every(isLocal)
  const searching = !pasted && (picklist || text.length >= 2)
  const browsing = searching && sources.some((source) => browses(source, text))

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
    }, picklist ? 0 : pause)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searching, picklist, text, sources, attempt])

  const seen = new Set(already)
  const found: Option[] = searching
    ? sources.flatMap((source) => {
        const result = results[source.label]
        if (result?.state !== 'done') return []
        return result.hits
          .filter((hit) => !seen.has(hit.uri) && seen.add(hit.uri))
          .map((hit) => ({ ...hit, id: `${listId}-${hit.uri}`, source: source.label }))
      })
    : []
  // A browse reads as one list of headings in order, so "United States. Congress. House" in LC Names comes before its subdivisions in LC Subjects.
  const options = browsing ? found.toSorted((a, b) => a.label.localeCompare(b.label, 'en')) : found
  const current = options[Math.min(active, options.length - 1)]

  // Wikidata's short description for each LC result, in one query.
  const lccns = options.flatMap((option) => lcAuthorityId(option.uri)?.id ?? []).join(' ')
  const described = useSource('wikidata descriptions', lccns, wikidataDescriptions)
  const descriptions = described?.state === 'done' ? described.value : {}
  const descriptionOf = (uri: string) => {
    const lccn = lcAuthorityId(uri)?.id
    return lccn ? descriptions[lccn] : undefined
  }

  // The context panel follows the highlighted result, once it's rested there.
  const previewUri = current && hasContext(current.uri) ? current.uri : null
  const previewLabel = current?.label ?? ''
  useEffect(() => {
    if (!previewUri) return
    const timer = setTimeout(() => preview({ uri: previewUri, label: previewLabel }), dwell)
    return () => clearTimeout(timer)
  }, [previewUri, previewLabel, preview])
  // Closing the lookup gives the panel back to what it showed before.
  useEffect(() => () => preview(null), [preview])

  /** A chosen entity the panel can say more about stays there. */
  const pick = (hit: Hit) => {
    if (hasContext(hit.uri)) select(hit.uri)
    onPick(hit)
  }

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
      else if (current) pick(current)
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
            picklist
              ? `Find ${label.toLowerCase()} in ${sources.map((source) => source.label).join(' and ')} by name or MARC code`
              : sources.length > 0
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
      {searching && !picklist && (
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
      {browsing && (
        <p className="muted hint">
          Headings beginning &ldquo;{text}&rdquo;, in alphabetical order. Leave out commas, periods and dashes to search
          by keyword.
        </p>
      )}
      {picklist && text && options.length === 0 && (
        <p className="muted hint">
          {/* Matches the field already has were left out, so "nothing" would be wrong. */}
          Nothing {sources.some((source) => hitsOf(results[source.label]).length > 0) ? 'else ' : ''}in{' '}
          {sources.map((source) => source.label).join(' or ')} matches
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
                onClick={() => pick(option)}
                onMouseEnter={() => setActive(options.indexOf(option))}
              >
                <span>
                  {option.label}
                  {hints && option.code && <span className="code"> {option.code}</span>}
                  {option.variant && <span className="lookup-variant">variant: {option.variant}</span>}
                  {descriptionOf(option.uri) && (
                    <span className="lookup-description">{descriptionOf(option.uri)}</span>
                  )}
                </span>
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
