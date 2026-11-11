import { useEffect, useMemo, useRef, useState } from 'react'

import { availability, transcribe, type Availability } from '../assist/chrome'
import {
  emptyTranscription,
  fieldLabels,
  fieldNames,
  fromRecord,
  score,
  pages,
  type FieldName,
  type Outcome,
  type Page,
  type Reading,
  type Score,
  type Transcription,
} from '../assist/transcription'
import { loadBounded } from '../api/bluecore'
import { instanceUri } from '../api/endpoints'
import { Header } from './Header'

/**
 * A test of transcribing from photos with Chrome's built-in model, in the dev
 * build only (?transcribe-test): photos of an item go in, with the record a
 * cataloger made from it, and each field the model reads is scored against
 * the record's. Runs are kept in this browser, without their photos, so a
 * dozen items can be tried and summed up. See docs/proposals/assistance.md.
 */

interface Run {
  id: string
  item: string
  photos: number
  /** What was read from each photo, before it was sorted into fields; missing from the first runs. */
  readings?: Reading[]
  expected: Transcription
  read: Transcription
  scores: Record<FieldName, Score>
  seconds: number
}

interface Photo {
  file: File
  page: Page
}

/** Photos usually come in order, title page then verso; the cataloger says otherwise. */
function guessPage(index: number): Page {
  return index === 0 ? 'Title page' : index === 1 ? 'Verso' : 'Other'
}

const storageKey = 'transcribe-test-runs'

const outcomes: Outcome[] = ['exact', 'close', 'wrong', 'misread', 'missed', 'added', 'absent']

export function TranscribeTest() {
  const [model, setModel] = useState<Availability | 'checking'>('checking')
  const [runs, setRuns] = useState<Run[]>(storedRuns)
  useEffect(() => {
    void availability().then(setModel, () => setModel('unavailable'))
  }, [])
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(runs))
    } catch {
      // Kept only for convenience; the page works without it.
    }
  }, [runs])

  return (
    <>
      <Header />
      <main className="page transcribe-test">
        <h1>Transcription test</h1>
        <p>
          Photos of an item go to Chrome’s built-in model, on this machine. What it reads is scored against the record a
          cataloger made from the same item. <strong>Exact</strong> is the same apart from spacing and final
          punctuation; <strong>close</strong> differs only in case, punctuation or diacritics;{' '}
          <strong>misread</strong> is an ISBN whose check digit doesn’t fit, or an LCCN of a shape LC never issues, which the editor
          would never offer. Say which page each photo shows: the title and statement of responsibility are taken only
          from the title page.
        </p>
        <ModelStatus model={model} />
        <Item model={model} onRun={(run) => setRuns([run, ...runs])} onModel={setModel} />
        {runs.length > 0 && <Summary runs={runs} onClear={() => setRuns([])} onRemove={(id) => setRuns(runs.filter((run) => run.id !== id))} />}
      </main>
    </>
  )
}

function storedRuns(): Run[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return stored ? (JSON.parse(stored) as Run[]) : []
  } catch {
    return []
  }
}

function ModelStatus({ model }: { model: Availability | 'checking' }) {
  const text: Record<Availability | 'checking', string> = {
    checking: 'Checking for Chrome’s built-in model…',
    available: 'Chrome’s built-in model is ready.',
    downloadable:
      'Chrome’s built-in model isn’t on this machine yet. The first transcription downloads it, a few gigabytes, once.',
    downloading: 'Chrome is downloading its built-in model.',
    unavailable:
      'This browser has no built-in model that reads images. It needs desktop Chrome 148 or later, with 22 GB free and 16 GB of memory or a GPU with more than 4 GB.',
  }
  return <p className={model === 'unavailable' ? 'note' : 'muted'}>{text[model]}</p>
}

function Item({
  model,
  onRun,
  onModel,
}: {
  model: Availability | 'checking'
  onRun: (run: Run) => void
  onModel: (model: Availability) => void
}) {
  const [input, setInput] = useState('')
  const [item, setItem] = useState('')
  const [expected, setExpected] = useState(emptyTranscription)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Run | null>(null)
  const [camera, setCamera] = useState(false)
  const files = useMemo(() => photos.map((photo) => photo.file), [photos])
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  const add = (added: File[]) => setPhotos((taken) => [...taken, ...added.map((file, i) => ({ file, page: guessPage(taken.length + i) }))])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const load = async () => {
    const uri = instanceUri(input)
    if (!uri) {
      setStatus('That isn’t a Blue Core Instance URI or UUID.')
      return
    }
    setStatus('Loading the record…')
    try {
      const { json } = await loadBounded(uri)
      setExpected(fromRecord(json))
      setItem(uri)
      setStatus(null)
    } catch (error) {
      setStatus(`Couldn’t load it: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const run = async () => {
    setBusy(true)
    setStatus(model === 'available' ? 'Starting…' : 'Downloading the model…')
    const started = performance.now()
    try {
      const { transcription, readings } = await transcribe(photos.map(({ file, page }) => ({ image: file, page })), {
        onProgress: (loaded) => loaded < 1 && setStatus(`Downloading the model: ${Math.floor(loaded * 100)}%`),
        onStep: setStatus,
      })
      onModel('available')
      const result: Run = {
        id: crypto.randomUUID(),
        item: item || input || photos[0]?.file.name || 'item',
        photos: photos.length,
        readings,
        expected,
        read: transcription,
        scores: score(transcription, expected),
        seconds: Math.round((performance.now() - started) / 100) / 10,
      }
      setLast(result)
      onRun(result)
      setStatus(null)
    } catch (error) {
      setStatus(`It didn’t work: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setInput('')
    setItem('')
    setExpected(emptyTranscription())
    setPhotos([])
    setCamera(false)
    setLast(null)
    setStatus(null)
  }

  return (
    <section>
      <h2>An item</h2>
      <p>
        <label>
          The record in Blue Core{' '}
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Instance URI or UUID" size={50} />
        </label>{' '}
        <button type="button" className="secondary" onClick={() => void load()} disabled={!input.trim()}>
          Load
        </button>
      </p>
      <p className="muted">Or type what the record says below. Correct anything the record got wrong, since it’s the answer key.</p>
      <table className="fields-table">
        <tbody>
          {fieldNames.map((name) => (
            <tr key={name}>
              <th scope="row">{fieldLabels[name]}</th>
              <td>
                <input
                  value={name === 'isbn' ? expected.isbn.join(' ') : expected[name]}
                  onChange={(event) =>
                    setExpected({
                      ...expected,
                      [name]: name === 'isbn' ? event.target.value.split(/\s+/).filter(Boolean) : event.target.value,
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <label>
          Photos of the title page, verso and CIP block{' '}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              add([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
        </label>{' '}
        {!camera && (
          <button type="button" className="secondary" onClick={() => setCamera(true)}>
            Take photos
          </button>
        )}
      </p>
      {camera && <Camera onPhoto={(photo) => add([photo])} onClose={() => setCamera(false)} />}
      {previews.length > 0 && (
        <div className="transcribe-photos">
          {previews.map((url, i) => (
            <figure key={url}>
              <img src={url} alt={photos[i]?.file.name} />
              <select
                aria-label="Which page it shows"
                value={photos[i]?.page}
                onChange={(event) =>
                  setPhotos(photos.map((photo, j) => (j === i ? { ...photo, page: event.target.value as Page } : photo)))
                }
              >
                {pages.map((page) => (
                  <option key={page}>{page}</option>
                ))}
              </select>{' '}
              <button type="button" className="link" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                Remove
              </button>
            </figure>
          ))}
        </div>
      )}
      <p>
        <button type="button" onClick={() => void run()} disabled={busy || photos.length === 0 || model === 'unavailable'}>
          Transcribe
        </button>{' '}
        <button type="button" className="secondary" onClick={reset} disabled={busy}>
          Next item
        </button>
      </p>
      {status && <p className="muted" role="status">{status}</p>}
      {last && <RunTable run={last} />}
    </section>
  )
}

/**
 * Photos from the machine's camera, for holding the item up to it: the back
 * camera if there is one, at the most detail it gives, since CIP blocks are
 * small print.
 */
function Camera({ onPhoto, onClose }: { onPhoto: (photo: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let stream: MediaStream | undefined
    let stopped = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 4096 } } })
      .then((opened) => {
        stream = opened
        if (stopped) opened.getTracks().forEach((track) => track.stop())
        else if (video.current) video.current.srcObject = opened
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const take = () => {
    const source = video.current
    if (!source?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = source.videoWidth
    canvas.height = source.videoHeight
    canvas.getContext('2d')?.drawImage(source, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        onPhoto(new File([blob], `photo-${new Date().toISOString()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="transcribe-camera">
      {error ? (
        <p className="note">The camera didn’t open: {error}</p>
      ) : (
        <video ref={video} autoPlay playsInline muted />
      )}
      <p>
        <button type="button" onClick={take} disabled={!!error}>
          Take photo
        </button>{' '}
        <button type="button" className="secondary" onClick={onClose}>
          Done
        </button>
      </p>
    </div>
  )
}

function RunTable({ run }: { run: Run }) {
  return (
    <>
      <Fields run={run} />
      {run.readings && run.readings.length > 0 && (
        <details className="transcribe-read">
          <summary>What it read</summary>
          {run.readings.map(({ page, lines }, i) => (
            <div key={i}>
              <h4>
                Photo {i + 1}, the {page.toLowerCase()}
              </h4>
              <pre>{lines}</pre>
            </div>
          ))}
        </details>
      )}
    </>
  )
}

function Fields({ run }: { run: Run }) {
  return (
    <table className="fields-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Record</th>
          <th>Read</th>
          <th>Outcome</th>
        </tr>
      </thead>
      <tbody>
        {fieldNames.map((name) => {
          const { outcome, differences } = run.scores[name]
          return (
            <tr key={name}>
              <th scope="row">{fieldLabels[name]}</th>
              <td>{shown(run.expected, name)}</td>
              <td>{shown(run.read, name)}</td>
              <td className={`outcome-${outcome}`}>
                {outcome}
                {differences.length > 0 && <span className="muted"> ({differences.join(', ')})</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function shown(transcription: Transcription, name: FieldName): string {
  return name === 'isbn' ? transcription.isbn.join(' ') : transcription[name]
}

function Summary({ runs, onClear, onRemove }: { runs: Run[]; onClear: () => void; onRemove: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const counts = fieldNames.map((name) => ({
    name,
    counts: Object.fromEntries(outcomes.map((outcome) => [outcome, runs.filter((run) => run.scores[name].outcome === outcome).length])) as Record<Outcome, number>,
  }))
  const seconds = runs.map((run) => run.seconds).toSorted((a, b) => a - b)
  const median = seconds[Math.floor(seconds.length / 2)] ?? 0
  const copy = async () => {
    await navigator.clipboard.writeText(markdown(runs, counts, median))
    setCopied(true)
  }
  return (
    <section>
      <h2>
        {runs.length} {runs.length === 1 ? 'item' : 'items'}
      </h2>
      <p className="muted">Median time per item: {median} seconds.</p>
      <table className="fields-table">
        <thead>
          <tr>
            <th>Field</th>
            {outcomes.map((outcome) => (
              <th key={outcome}>{outcome}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {counts.map(({ name, counts }) => (
            <tr key={name}>
              <th scope="row">{fieldLabels[name]}</th>
              {outcomes.map((outcome) => (
                <td key={outcome} className="share">
                  {counts[outcome] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button type="button" className="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy as Markdown'}
        </button>{' '}
        <button type="button" className="secondary" onClick={onClear}>
          Clear all
        </button>
      </p>
      <details>
        <summary>Each item</summary>
        {runs.map((run) => (
          <div key={run.id}>
            <h3>
              {run.item} <span className="muted">({run.photos} photos, {run.seconds} s)</span>{' '}
              <button type="button" className="link" onClick={() => onRemove(run.id)}>
                Remove
              </button>
            </h3>
            <RunTable run={run} />
          </div>
        ))}
      </details>
    </section>
  )
}

function markdown(runs: Run[], counts: { name: FieldName; counts: Record<Outcome, number> }[], median: number): string {
  const head = `| Field | ${outcomes.join(' | ')} |\n|---|${outcomes.map(() => '---:').join('|')}|`
  const rows = counts.map(({ name, counts }) => `| ${fieldLabels[name]} | ${outcomes.map((o) => counts[o] || '').join(' | ')} |`)
  const misses = runs.flatMap((run) =>
    fieldNames
      .filter((name) => ['close', 'wrong', 'added'].includes(run.scores[name].outcome))
      .map((name) => {
        const { outcome, differences } = run.scores[name]
        const why = differences.length > 0 ? ` (${differences.join(', ')})` : ''
        return `- ${fieldLabels[name]}, ${outcome}${why}: record “${shown(run.expected, name)}”, read “${shown(run.read, name)}”`
      }),
  )
  return [
    `${runs.length} items, median ${median} s each, with Chrome’s built-in model.`,
    '',
    head,
    ...rows,
    ...(misses.length > 0 ? ['', 'Where it differed:', '', ...misses] : []),
  ].join('\n')
}
