import { useState } from 'react'

import { complexSubject, joinHeading } from '../doc/complex'
import { change } from '../doc/log'
import { fragment, getNode, type Doc, type Json, type Key } from '../doc/model'
import { composes, sourcesFor } from '../lookup/sources'
import { useDescription } from './context'
import { entryFor, fieldKind, newValue } from './form'
import { termLabel } from './labels'
import { Lookup } from './Lookup'

/**
 * Adding a value to a property: "Add another" under a field, a field of a
 * subform not yet filled in, or the field "Add field" found. What it asks for
 * comes from the schema: text, a label, a link, or which type of node.
 */
export function AddValue({
  node,
  prop,
  label,
  changeLabel = label,
  prompt,
  open: startOpen = false,
  focus = !startOpen,
  onDone,
}: {
  node: Key
  prop: string
  /** What the field is called. */
  label: string
  /** What the history calls it, where the label alone is too little: "OCLC number value", not "Value". */
  changeLabel?: string
  /** The button that opens it, such as "Add another". */
  prompt: string
  /** Start open, as a subform's empty text fields do. */
  open?: boolean
  /** Take the keyboard focus on opening; by default only a field opened by its button does. */
  focus?: boolean
  onDone?: () => void
}) {
  const { doc, record } = useDescription()
  const [open, setOpen] = useState(startOpen)
  const [text, setText] = useState('')
  const entry = entryFor(fieldKind(doc, node, prop))
  const [type, setType] = useState(entry.entry === 'node' ? entry.preferred : '')

  const close = () => {
    setText('')
    setOpen(startOpen)
    onDone?.()
  }

  const insert = (json: Json, what: string) => {
    const values = getNode(doc, node).props[prop] ?? []
    const after = values.at(-1)?.key ?? null
    const { value, nodes } = fragment(json, { node, prop })
    record(change(`Added ${changeLabel}: ${what}`, [{ op: 'insert', node, prop, after, value, nodes }]))
    close()
  }

  const add = (link?: { uri: string; label: string }) => {
    const json = newValue(entry, { text, type, ...link })
    if (json === null) return false
    insert(json, entry.entry === 'node' ? termLabel(type) : link ? link.label || link.uri : text.trim())
    return true
  }

  if (!open) {
    return (
      <button type="button" className="add" onClick={() => setOpen(true)}>
        {prompt}
      </button>
    )
  }

  switch (entry.entry) {
    case 'text':
    case 'label':
      return (
        <span className="adding">
          <input
            aria-label={label}
            placeholder={startOpen ? '' : label}
            value={text}
            autoFocus={focus}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
              if (!add() && !text.trim()) close()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add()
              if (event.key === 'Escape') close()
            }}
          />
        </span>
      )
    case 'link':
      return (
        <Lookup
          label={label}
          sources={sourcesFor(prop)}
          already={linkedFrom(doc, node, prop)}
          compose={composes(prop)}
          onPick={(hit) => add(hit)}
          onCompose={(components) => insert(complexSubject(components), joinHeading(components))}
          onCancel={close}
        />
      )
    case 'node':
      return (
        <span className="adding">
          {entry.types.length > 1 && (
            <select aria-label={`Type of ${label}`} value={type} onChange={(event) => setType(event.target.value)} autoFocus>
              {entry.types.map((option) => (
                <option key={option} value={option}>
                  {termLabel(option)}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="secondary" onClick={() => add()}>
            Add {entry.types.length > 1 ? '' : termLabel(type)}
          </button>
          <button type="button" className="link" onClick={close}>
            Cancel
          </button>
        </span>
      )
  }
}

/** The URIs a property already links to. */
function linkedFrom(doc: Doc, node: Key, prop: string): Set<string> {
  const values = getNode(doc, node).props[prop] ?? []
  return new Set(
    values.flatMap((value) => {
      const id = 'node' in value ? getNode(doc, value.node).keywords['@id'] : undefined
      return typeof id === 'string' ? [id] : []
    }),
  )
}
