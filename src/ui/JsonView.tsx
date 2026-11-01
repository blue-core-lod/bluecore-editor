import { useState, type ReactNode } from 'react'

import { hasContext } from '../context/lc'
import { isPlaceholder } from '../doc/blank'
import { denormalize, type Doc, type Json, type Key } from '../doc/model'
import { linkedResource, principals } from '../doc/resources'
import { isUri } from './labels'

/**
 * The record as bibframe-json, the JSON Blue Core stores. "As it will be
 * saved" shows the Instance and the Work as the separate documents a save
 * writes; "Bounded" shows the Instance with its Work embedded, as the editor
 * holds it. It reads, and never changes the record.
 */
export function JsonView({
  doc,
  changed,
  select,
}: {
  doc: Doc
  /** The resources with unsaved changes. */
  changed: ReadonlySet<Key>
  /** Open a linked entity in the context panel. */
  select: (uri: string) => void
}) {
  const [mode, setMode] = useState<'saved' | 'bounded'>('saved')
  const { instance, work } = principals(doc)
  const documents =
    mode === 'saved'
      ? [
          { name: 'Instance', key: instance, json: linkedResource(doc, instance) },
          ...(work ? [{ name: 'Work', key: work, json: linkedResource(doc, work) }] : []),
        ]
      : [{ name: 'Instance with its Work', key: null, json: denormalize(doc) }]

  return (
    <div className="json-view">
      <p className="muted">
        This record as <a href="https://bibframe-json.org/" target="_blank" rel="noreferrer">bibframe-json</a>, the JSON
        Blue Core stores.
      </p>
      <div className="json-modes" role="radiogroup" aria-label="Which form">
        <label>
          <input type="radio" checked={mode === 'saved'} onChange={() => setMode('saved')} /> As it will be saved
        </label>
        <label>
          <input type="radio" checked={mode === 'bounded'} onChange={() => setMode('bounded')} /> Bounded
        </label>
      </div>
      {documents.map((document) => {
        const id = document.json['@id']
        return (
          <section key={document.name} className="json-document">
            <header>
              <h3>{document.name}</h3>
              {document.key && changed.has(document.key) && <span className="json-changed">unsaved changes</span>}
              {typeof id === 'string' && isPlaceholder(id) && (
                <span className="muted">new: Blue Core gives it a URI when it’s saved</span>
              )}
              <CopyButton text={JSON.stringify(document.json, null, 2)} />
            </header>
            <pre>
              <JsonValue value={document.json} depth={0} select={select} />
            </pre>
          </section>
        )
      })}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true))
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** JSON as JSON.stringify would indent it, with each URI a link: to the context panel where it can say more. */
function JsonValue({ value, depth, select }: { value: Json; depth: number; select: (uri: string) => void }): ReactNode {
  const indent = '  '.repeat(depth + 1)
  const closing = '  '.repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return (
      <>
        {'[\n'}
        {value.map((item, i) => (
          <span key={i}>
            {indent}
            <JsonValue value={item} depth={depth + 1} select={select} />
            {i < value.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {closing}]
      </>
    )
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    return (
      <>
        {'{\n'}
        {entries.map(([name, item], i) => (
          <span key={name}>
            {indent}
            <span className="json-key">{JSON.stringify(name)}</span>:{' '}
            <JsonValue value={item} depth={depth + 1} select={select} />
            {i < entries.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {closing}
        {'}'}
      </>
    )
  }
  if (typeof value === 'string' && isUri(value)) {
    const quoted = JSON.stringify(value)
    return hasContext(value) ? (
      <button type="button" className="link json-link" title="More about this" onClick={() => select(value)}>
        {quoted}
      </button>
    ) : (
      <a className="json-link" href={value} target="_blank" rel="noreferrer">
        {quoted}
      </a>
    )
  }
  return <span className="json-literal">{JSON.stringify(value)}</span>
}
