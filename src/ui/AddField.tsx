import { useMemo, useState } from 'react'

import { getNode, type Key } from '../doc/model'
import { principals } from '../doc/resources'
import { allProperties, belongsOn } from '../schema/fields'
import { AddValue } from './AddValue'
import { useDescription } from './context'
import { termLabel, typesOf } from './labels'
import { recordProps, sections, structural, type ResourceKind } from './presentation'

/** MARC tags by property, from the sidecar, so "490" finds the series statement. */
const marcOf = new Map(
  sections.flatMap((section) => section.fields.flatMap((field) => (field.marc ? [[field.prop, field.marc] as const] : []))),
)

const excluded = new Set([...recordProps, ...structural.Instance, ...structural.Work])

interface Match {
  prop: string
  label: string
  marc: string | undefined
  /** Where it can go, by the ontology's domain. */
  on: [ResourceKind, Key][]
}

/**
 * "Add field": any BIBFRAME property, found by name or MARC tag, added to the
 * Instance or the Work. Where the ontology gives a property a domain, only
 * that resource is offered; the others offer both, badged.
 */
export function AddField() {
  const { doc, hints } = useDescription()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<{ prop: string; label: string; node: Key } | null>(null)

  const resources = useMemo((): [ResourceKind, Key][] => {
    const { instance, work } = principals(doc)
    return work ? [['Instance', instance], ['Work', work]] : [['Instance', instance]]
  }, [doc])

  const matches = useMemo((): Match[] => {
    const text = query.trim().toLowerCase()
    if (!text) return []
    const scored = allProperties
      .filter((prop) => !excluded.has(prop))
      .map((prop) => {
        const label = termLabel(prop)
        const marc = marcOf.get(prop)
        const score = marc?.startsWith(text)
          ? 0
          : label.toLowerCase().startsWith(text)
            ? 1
            : label.toLowerCase().includes(text) || prop.toLowerCase().includes(text)
              ? 2
              : null
        const on = resources.filter(([, key]) => belongsOn(prop, typesOf(getNode(doc, key))))
        return { prop, label, marc, on, score }
      })
      .filter((match): match is Match & { score: number } => match.score !== null && match.on.length > 0)
    return scored.toSorted((a, b) => a.score - b.score || a.label.localeCompare(b.label)).slice(0, 8)
  }, [query, resources, doc])

  if (chosen) {
    return (
      <section className="section add-field">
        <h2>Add {chosen.label.toLowerCase()}</h2>
        <AddValue
          node={chosen.node}
          prop={chosen.prop}
          label={chosen.label}
          prompt=""
          open
          focus
          onDone={() => {
            setChosen(null)
            setQuery('')
          }}
        />
      </section>
    )
  }

  return (
    <section className="section add-field">
      <label htmlFor="add-field">
        <h2>Add field</h2>
      </label>
      <input
        id="add-field"
        placeholder="Search by name or MARC tag, such as “series” or “490”"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length > 0 && (
        <ul className="matches">
          {matches.map((match) => (
            <li key={match.prop}>
              <span>
                {match.label}
                {hints && match.marc && <span className="marc"> {match.marc}</span>}
              </span>
              <span className="on">
                {match.on.map(([kind, node]) => (
                  <button
                    key={kind}
                    type="button"
                    className={`badge badge-${kind.toLowerCase()}`}
                    title={`Add ${match.label} to the ${kind}`}
                    onClick={() => setChosen({ prop: match.prop, label: match.label, node })}
                  >
                    {match.on.length > 1 ? `on ${kind}` : `Add to ${kind}`}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
