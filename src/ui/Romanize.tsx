import { useId, useMemo, useState } from 'react'

import { config } from '../config'
import { useSource } from '../context/useSource'
import { convert, type Conversion } from '../romanize/scriptshifter'
import { candidates, scriptName, tableById, type Direction, type Table } from '../romanize/tables'
import { useDescription } from './context'

/**
 * A conversion proposed with ScriptShifter, script to Roman or back, for the
 * cataloger to accept, correct or dismiss: nothing is in the record until
 * they accept it. The table is the cataloger's last choice in this record if
 * it fits, or else the best guess from the value's tag and script and the
 * record's language; they can pick another.
 */
export function ConvertValue({
  direction,
  text,
  script,
  tag,
  replacing,
  onAccept,
  onCancel,
}: {
  direction: Direction
  text: string
  /** The script the text is in, from script to Roman. */
  script?: string
  /** The text's language tag, if it has one. */
  tag?: string
  /** The value the conversion would replace, if there's one already. */
  replacing?: string
  onAccept: (output: string, table: Table) => void
  onCancel: () => void
}) {
  const { languages, lastTable, rememberTable } = useDescription()
  const id = useId()
  const options = useMemo(
    () => candidates(direction, { script: direction === 's2r' ? script : undefined, tag, languages }),
    [direction, script, tag, languages],
  )
  const [chosen, setChosen] = useState(() => options.find((table) => table.id === lastTable)?.id ?? options[0]?.id)
  const table = chosen ? tableById(chosen) : undefined
  const key = table ? JSON.stringify([table.id, direction, text]) : null
  const fetched = useSource('scriptshifter', key, load)
  // The cataloger's corrections, kept per conversion: switching tables shows each one's own, and a change
  // to the text being converted starts afresh.
  const [edited, setEdited] = useState<Record<string, string>>({})
  const output = key ? (edited[key] ?? (fetched?.state === 'done' ? fetched.value.output : '')) : ''

  const what = direction === 's2r' ? 'Romanization' : 'Original script'
  if (options.length === 0) {
    return (
      <div className="convert" role="group" aria-label={what}>
        <p className="convert-note">
          ScriptShifter has no table {direction === 's2r' ? `for ${script ? scriptName(script) : 'this script'}` : 'for this'}.
        </p>
        <button type="button" className="secondary" onClick={onCancel}>
          Close
        </button>
      </div>
    )
  }

  const accept = () => {
    if (!table || !output.trim()) return
    rememberTable(table.id)
    onAccept(output, table)
  }

  return (
    <div className="convert" role="group" aria-label={what}>
      <label className="convert-table" htmlFor={`${id}-table`}>
        {direction === 's2r' ? 'Romanize as' : 'Original script for'}{' '}
        <select id={`${id}-table`} value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {options.map((option) => (
            <option key={option.id} value={option.id} title={option.description}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {fetched?.state === 'loading' && <p className="convert-note">Asking ScriptShifter…</p>}
      {fetched?.state === 'failed' && (
        <p className="convert-note error" role="alert">
          ScriptShifter couldn’t convert this: {fetched.error}
        </p>
      )}
      {fetched?.state === 'done' && (
        <>
          <input
            aria-label={`${what}, from ScriptShifter`}
            lang={direction === 'r2s' ? table?.tag : undefined}
            value={output}
            onChange={(event) => key && setEdited({ ...edited, [key]: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') accept()
              if (event.key === 'Escape') onCancel()
            }}
          />
          {fetched.value.warnings.length > 0 && (
            <ul className="convert-warnings">
              {fetched.value.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {replacing !== undefined && <p className="convert-note">Replaces “{replacing}”.</p>}
        </>
      )}
      <div className="convert-actions">
        <button type="button" disabled={fetched?.state !== 'done' || !output.trim()} onClick={accept}>
          {replacing !== undefined ? 'Replace' : 'Add'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="convert-source">
        From LC’s{' '}
        <a href={config.scriptshifterUrl} target="_blank" rel="noreferrer">
          ScriptShifter
        </a>
        . Check it against the ALA-LC tables: proper names and word division often need correcting.
      </p>
    </div>
  )
}

function load(key: string): Promise<Conversion> {
  const [table, direction, text] = JSON.parse(key) as [string, Direction, string]
  return convert(table, text, direction)
}
