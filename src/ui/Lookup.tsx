import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { kinds, subfield, type Component } from '../doc/complex'
import { hasContext, lcAuthorityId } from '../context/lc'
import { useSource } from '../context/useSource'
import { wikidataDescriptions } from '../context/wikidata'
import {
  componentOf,
  composed,
  fromLine,
  inLine,
  isSubdivisionRecord,
  partAt,
  partsOf,
  pickedAt,
  replacePart,
  sameHeading,
  type Picked,
} from '../lookup/compose'
import { browses, searchSource, type Hit } from '../lookup/qa'
import { composing as composeSources, isLocal, type Source } from '../lookup/sources'
import { useDescription } from './context'
import { isUri } from './labels'

type SourceState = { state: 'loading' } | { state: 'done'; hits: Hit[] } | { state: 'failed' }

interface Option extends Hit {
  id: string
  source: string
  /** A whole heading, when composing: picking it links the heading rather than filling a part. */
  whole: boolean
}

interface Search {
  source: Source
  query: string
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
 *
 * A subject can also be composed from parts, "Jews--Germany--History", each
 * part searched as the cursor reaches it (see lookup/compose.ts).
 */
export function Lookup({
  label,
  sources,
  already,
  compose,
  initial,
  onPick,
  onCompose,
  onCancel,
}: {
  /** What the field is called, such as "Subject". */
  label: string
  sources: Source[]
  /** URIs the field already links to, not offered again. */
  already: ReadonlySet<string>
  /** Whether a heading can be composed from parts. */
  compose?: boolean
  /** A complex subject being edited, as its parts. */
  initial?: readonly Component[]
  onPick: (hit: Hit) => void
  /** A heading composed from parts. */
  onCompose?: (components: Component[]) => void
  onCancel: () => void
}) {
  const { hints, select, preview } = useDescription()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(() => initial?.map((component) => inLine(component.label)).join('--') ?? '')
  const [caret, setCaret] = useState(query.length)
  const [moveCaret, setMoveCaret] = useState<number | null>(null)
  const [picked, setPicked] = useState<Picked>(() => ({ ...initial }))
  const [kindOf, setKindOf] = useState<Record<number, string>>(() =>
    Object.fromEntries((initial ?? []).flatMap((component, i) => (component.uri ? [] : [[i, component.type]]))),
  )
  const [pastedLabel, setPastedLabel] = useState('')
  const [results, setResults] = useState<Record<string, SourceState>>({})
  const [active, setActive] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)

  const text = query.trim()
  const pasted = isUri(text)
  const parts = useMemo(() => partsOf(query), [query])
  const composing = Boolean(compose) && !pasted && parts.length > 1
  const index = composing ? partAt(parts, caret) : 0
  const part = parts[index]
  const partText = fromLine(part?.text ?? '')
  const partPicked = composing ? pickedAt(picked, parts, index) : undefined
  // A picklist (only vendored vocabularies) answers at once, and from the first keystroke, or none.
  const picklist = sources.length > 0 && sources.every(isLocal)

  // What to search: the field's sources for what's typed, or, composing, the part the cursor is in and the whole heading.
  const searches = useMemo((): Search[] => {
    if (pasted) return []
    if (!composing) return picklist || text.length >= 2 ? sources.map((source) => ({ source, query: text })) : []
    const forPart = partPicked || !partText ? [] : index === 0 ? composeSources.first : composeSources.subdivisions
    return [
      ...forPart.map((source) => ({ source, query: partText })),
      { source: composeSources.whole, query: parts.map((p) => fromLine(p.text)).join('--') },
    ]
  }, [pasted, composing, picklist, text, sources, partPicked, partText, index, parts])
  const searching = searches.length > 0
  const browsing = !composing && searching && sources.some((source) => browses(source, text))

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setResults(Object.fromEntries(searches.map(({ source }) => [source.label, { state: 'loading' }])))
      for (const { source, query } of searches) {
        searchSource(source, query, controller.signal).then(
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
  }, [searching, searches, picklist, attempt])

  // After a part is picked, the cursor moves on to the next part still to find.
  useLayoutEffect(() => {
    if (moveCaret === null || !input.current) return
    input.current.setSelectionRange(moveCaret, moveCaret)
    setCaret(moveCaret)
    setMoveCaret(null)
  }, [moveCaret])

  // A part may well be something the field links already ("California"); only a whole subject can't be added twice.
  const seen = new Set(already)
  const seenParts = new Set<string>()
  const found: Option[] = searches.flatMap(({ source }) => {
    const result = results[source.label]
    if (result?.state !== 'done') return []
    const whole = !composing || source === composeSources.whole
    const unseen = whole ? seen : seenParts
    return result.hits
      .filter((hit) => !(composing && index === 0 && !whole && isSubdivisionRecord(hit)))
      .filter((hit) => !unseen.has(hit.uri) && unseen.add(hit.uri))
      .map((hit) => ({ ...hit, id: `${listId}-${hit.uri}`, source: source.label, whole: composing && whole }))
  })
  // A browse reads as one list of headings in order, so "United States. Congress. House" in LC Names comes before its subdivisions in LC Subjects.
  const options = browsing ? found.toSorted((a, b) => a.label.localeCompare(b.label, 'en')) : found
  // Composing, a part already found leaves nothing chosen, so Enter adds the subject rather than a whole heading.
  const highlighted = active ?? (composing && (partPicked || !partText) ? -1 : 0)
  const current = highlighted >= 0 ? options[Math.min(highlighted, options.length - 1)] : undefined

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

  const edit = (value: string, at: number) => {
    setQuery(value)
    setCaret(at)
    setActive(null)
  }

  /** A chosen entity the panel can say more about stays there. */
  const pick = (option: Option) => {
    if (!composing || option.whole) {
      if (hasContext(option.uri)) select(option.uri)
      onPick(option)
      return
    }
    if (!part) return
    const next = replacePart(query, part, inLine(option.label))
    const nextParts = partsOf(next.text)
    setPicked({ ...picked, [index]: componentOf(option) })
    setQuery(next.text)
    setActive(null)
    // On to the next part not yet picked, or the end of the line.
    const later = nextParts.findIndex((p, i) => i > index && p.text && !pickedAt(picked, nextParts, i))
    setMoveCaret(later === -1 ? next.text.length : (nextParts[later]?.end ?? next.text.length))
  }

  const components = composing ? composed(parts, picked, kindOf) : []
  const add = () => {
    if (components.length < 2) return
    // A heading LC has already is linked whole, not built from parts.
    const heading = components.map((component) => component.label).join('--')
    const established = hitsOf(results[composeSources.whole.label]).find((hit) => sameHeading(hit.label, heading))
    if (established) {
      if (hasContext(established.uri)) select(established.uri)
      onPick(established)
    } else onCompose?.(components)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onCancel()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(highlighted + 1, options.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(highlighted - 1, 0))
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (pasted) onPick({ uri: text, label: pastedLabel.trim() })
      else if (current) pick(current)
      else if (composing) add()
    }
  }

  const sourceNames = sources.map((source) => source.label).join(' and ')
  return (
    <div className="lookup">
      <div className="adding">
        <input
          ref={input}
          role="combobox"
          aria-label={`Find ${label.toLowerCase()}`}
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={current?.id}
          aria-autocomplete="list"
          placeholder={
            picklist
              ? `Find ${label.toLowerCase()} in ${sourceNames} by name or MARC code`
              : compose
                ? `Find ${label.toLowerCase()} in ${sourceNames}, with -- between subdivisions, or paste a URI`
                : sources.length > 0
                  ? `Find ${label.toLowerCase()} in ${sourceNames}, or paste a URI`
                  : `Paste the URI of the ${label.toLowerCase()}`
          }
          value={query}
          autoFocus
          onChange={(event) => edit(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? query.length)}
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
        {composing && (
          <button type="button" className="secondary" disabled={components.length < 2} onClick={add}>
            Add
          </button>
        )}
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {composing && (
        <Composed
          components={components}
          hints={hints}
          current={index}
          parts={parts.map((p) => p.text)}
          setKind={(i, type) => setKindOf({ ...kindOf, [i]: type })}
        />
      )}
      {searching && !picklist && (
        <p className="lookup-sources" aria-live="polite">
          {searches.map(({ source }) => {
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
      {composing && !current && (
        <p className="muted hint">
          Enter adds the subject. Type -- for another subdivision, or move the cursor into a part to find it in LC.
        </p>
      )}
    </div>
  )
}

/**
 * The subject as composed so far, one row in order: each part found in LC is
 * linked, each other part is text with its kind to choose.
 */
function Composed({
  components,
  parts,
  current,
  hints,
  setKind,
}: {
  components: readonly Component[]
  /** The text of every part, empty ones included, so positions match the line. */
  parts: readonly string[]
  current: number
  hints: boolean
  setKind: (index: number, type: string) => void
}) {
  // Components leave out empty parts; map each back to its position in the line.
  const positions = parts.flatMap((text, i) => (text ? [i] : []))
  return (
    <ol className="composed" aria-label="Parts of the subject">
      {components.map((component, n) => {
        const at = positions[n] ?? n
        return (
          <li key={at} className={at === current ? 'current' : undefined}>
            {hints && <span className="code">${subfield(component, n)}</span>}
            {component.uri ? (
              <span className="linked" title={component.uri}>
                {component.label}
              </span>
            ) : at === current ? (
              // The part being typed: its kind is asked once the cursor moves on.
              <span className="unlinked">{component.label}</span>
            ) : (
              <>
                <span className="unlinked" title="Not linked to an LC authority">
                  {component.label}
                </span>
                <select
                  aria-label={`Kind of “${component.label}”`}
                  value={component.type}
                  onChange={(event) => setKind(at, event.target.value)}
                >
                  {kinds.map((kind) => (
                    <option key={kind.type} value={kind.type}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}
