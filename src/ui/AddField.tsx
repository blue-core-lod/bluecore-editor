import { useMemo, useState } from 'react'

import { getNode, type Key } from '../doc/model'
import { principals } from '../doc/resources'
import { allProperties, belongsOn } from '../schema/fields'
import { kindShare, resourceTypeOf, usage } from '../schema/guidance'
import { AddValue } from './AddValue'
import { useDescription } from './context'
import { termLabel, typesOf } from './labels'
import { recordProps, sections, structural, type ResourceKind } from './presentation'
import { isTagQuery, tagMatches } from './tags'

/** The sidecar's label and MARC tag for a property ("Subjects", "650"), so a field is called the same here as in its section. */
const sidecar = new Map(
  sections.flatMap((section) => section.fields.flatMap((field) => (field.on === 'Work' ? [] : [[field.prop, field] as const]))),
)

const excluded = new Set([...recordProps, ...structural.Instance, ...structural.Work])

interface Match {
  id: string
  prop: string
  label: string
  marc: string | undefined
  /** What MARC calls the tag, when the search was by tag. */
  marcName?: string
  /** The kind of node to start on, where the tag says. */
  type?: string
  /** Where it can go, by the ontology's domain. */
  on: [ResourceKind, Key][]
  /** How many of LC's records of this kind use it, 0 to 1, where guidance knows the kind. */
  share?: number
}

/**
 * "Add field": any BIBFRAME property, found by name or MARC tag, added to the
 * Instance or the Work. Where the ontology gives a property a domain, only
 * that resource is offered; the others offer both, badged.
 */
export function AddField() {
  const { doc, hints } = useDescription()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<{ prop: string; label: string; node: Key; type?: string } | null>(null)

  const resources = useMemo((): [ResourceKind, Key][] => {
    const { instance, work } = principals(doc)
    return work ? [['Instance', instance], ['Work', work]] : [['Instance', instance]]
  }, [doc])

  const kind = useMemo(() => resourceTypeOf(doc), [doc])

  const matches = useMemo((): Match[] => {
    const text = query.trim().toLowerCase()
    if (!text) return []
    const shareOf = (prop: string) => (kind ? usage(kind.id, prop)?.share : undefined)
    const where = (prop: string, only?: ResourceKind) =>
      resources.filter(([resource, key]) => (!only || resource === only) && belongsOn(prop, typesOf(getNode(doc, key))))

    // By MARC tag: every field the tag leads to, in tag order.
    if (isTagQuery(text)) {
      return tagMatches(text)
        .filter((entry) => !excluded.has(entry.prop))
        .flatMap((entry): Match[] => {
          const on = where(entry.prop, entry.on)
          if (on.length === 0) return []
          const label =
            entry.prop === 'title' && entry.on === 'Work'
              ? 'Preferred title'
              : entry.type && entry.type !== 'Title'
                ? termLabel(entry.type)
                : labelOf(entry.prop)
          // A tag that names a kind of node is used as often as that kind is: 246 as variant titles, not titles.
          const share = entry.type && kind ? kindShare(kind.id, entry.prop, entry.type) : shareOf(entry.prop)
          return [
            {
              id: `${entry.tag} ${entry.prop} ${entry.type ?? ''}`,
              prop: entry.prop,
              label,
              marc: entry.tag,
              ...(entry.name !== label ? { marcName: entry.name } : {}),
              ...(entry.type ? { type: entry.type } : {}),
              on,
              ...(share ? { share } : {}),
            },
          ]
        })
        .slice(0, 12)
    }

    // By name.
    const scored = allProperties
      .filter((prop) => !excluded.has(prop))
      .map((prop) => {
        const label = labelOf(prop)
        const score = label.toLowerCase().startsWith(text)
          ? 1
          : label.toLowerCase().includes(text) || prop.toLowerCase().includes(text)
            ? 2
            : null
        const share = shareOf(prop)
        return { id: prop, prop, label, marc: sidecar.get(prop)?.marc, on: where(prop), score, ...(share ? { share } : {}) }
      })
      .filter((match): match is Match & { score: number } => match.score !== null && match.on.length > 0)
    // Among equally good matches, what this kind of record uses most comes first.
    return scored
      .toSorted((a, b) => a.score - b.score || (b.share ?? 0) - (a.share ?? 0) || a.label.localeCompare(b.label))
      .slice(0, 8)
  }, [query, resources, doc, kind])

  if (chosen) {
    return (
      <section className="section add-field">
        <h2>Add {inSentence(chosen.label)}</h2>
        <AddValue
          node={chosen.node}
          prop={chosen.prop}
          label={chosen.label}
          prompt=""
          open
          focus
          {...(chosen.type ? { type: chosen.type } : {})}
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
            <li key={match.id}>
              <span>
                {match.label}
                {match.marc && (hints || isTagQuery(query)) && (
                  <span className="marc">
                    {' '}
                    {match.marc}
                    {match.marcName && ` ${match.marcName}`}
                  </span>
                )}
                {kind && match.share !== undefined && match.share >= 0.01 && (
                  <span className="usage">
                    used in {Math.round(match.share * 100)}% of {kind.plural}
                  </span>
                )}
              </span>
              <span className="on">
                {match.on.map(([kind, node]) => (
                  <button
                    key={kind}
                    type="button"
                    className={`badge badge-${kind.toLowerCase()}`}
                    title={`Add ${match.label} to the ${kind}`}
                    onClick={() =>
                      setChosen({ prop: match.prop, label: match.label, node, ...(match.type ? { type: match.type } : {}) })
                    }
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

function labelOf(prop: string): string {
  return sidecar.get(prop)?.label ?? termLabel(prop)
}

/** A label as it reads mid-sentence: "Series statement" as "series statement", but "ISBN" kept. */
function inSentence(label: string): string {
  return label.split(' ').map((word) => (/^[A-Z][A-Z]/.test(word) ? word : word.toLowerCase())).join(' ')
}
