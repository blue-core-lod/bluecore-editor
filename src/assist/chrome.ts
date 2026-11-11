import {
  fieldInstructions,
  fieldPrompt,
  parseTranscription,
  readingInstructions,
  readingPrompt,
  schema,
  type Transcription,
} from './transcription'

/**
 * Chrome's built-in model (Gemini Nano), through the Prompt API: desktop
 * Chrome 148 and later, on a machine with room for it. It runs on the
 * cataloger's own machine, so the photos go nowhere. In any other browser
 * `LanguageModel` is missing and this reports "unavailable".
 *
 * https://developer.chrome.com/docs/ai/prompt-api
 */

export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

// The part of the Prompt API used here; TypeScript's DOM library doesn't have it yet.
interface Session {
  prompt(messages: unknown, options?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>
  destroy(): void
}

interface CreateOptions {
  expectedInputs: { type: 'text' | 'image'; languages?: string[] }[]
  expectedOutputs: { type: 'text'; languages?: string[] }[]
  initialPrompts?: { role: 'system'; content: string }[]
  monitor?: (monitor: EventTarget) => void
  signal?: AbortSignal
}

interface LanguageModelApi {
  availability(options: CreateOptions): Promise<Availability>
  create(options: CreateOptions): Promise<Session>
}

const options: CreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

function api(): LanguageModelApi | undefined {
  return (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel
}

export async function availability(): Promise<Availability> {
  const model = api()
  return model ? model.availability(options) : 'unavailable'
}

/**
 * Read the fields off photos of the item, in the two steps transcription.ts
 * describes: each photo's lines, one photo at a time so each has the context
 * to itself, then the fields from the lines. The first call may download the
 * model, a few gigabytes, so it must come from a click; onProgress gets the
 * share downloaded, 0 to 1.
 */
export async function transcribe(
  images: Blob[],
  {
    onProgress,
    onStep,
    signal,
  }: { onProgress?: (loaded: number) => void; onStep?: (step: string) => void; signal?: AbortSignal } = {},
): Promise<{ transcription: Transcription; read: string[] }> {
  const model = api()
  if (!model) throw new Error('This browser has no built-in model.')
  const monitor = (target: EventTarget) =>
    target.addEventListener('downloadprogress', (event) => onProgress?.((event as ProgressEvent).loaded))

  const read: string[] = []
  for (const [i, image] of images.entries()) {
    onStep?.(`Reading photo ${i + 1} of ${images.length}…`)
    // A fresh session per photo, so one photo's lines don't crowd out the next's.
    const session = await model.create({
      ...options,
      initialPrompts: [{ role: 'system', content: readingInstructions }],
      monitor,
      signal,
    })
    try {
      read.push(
        await session.prompt(
          [{ role: 'user', content: [{ type: 'text', value: readingPrompt }, { type: 'image', value: image }] }],
          { signal },
        ),
      )
    } finally {
      session.destroy()
    }
  }

  onStep?.('Sorting the lines into fields…')
  const session = await model.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    initialPrompts: [{ role: 'system', content: fieldInstructions }],
    monitor,
    signal,
  })
  try {
    const raw = await session.prompt(fieldPrompt(read), { responseConstraint: schema, signal })
    return { transcription: parseTranscription(raw), read }
  } finally {
    session.destroy()
  }
}
