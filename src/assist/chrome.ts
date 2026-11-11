import { instructions, parseTranscription, schema, type Transcription } from './transcription'

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
  expectedInputs: [
    { type: 'text', languages: ['en'] },
    { type: 'image' },
  ],
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
 * Read the fields off photos of the item. The first call may download the
 * model, a few gigabytes, so it must come from a click; onProgress gets the
 * share downloaded, 0 to 1.
 */
export async function transcribe(
  images: Blob[],
  { onProgress, signal }: { onProgress?: (loaded: number) => void; signal?: AbortSignal } = {},
): Promise<{ transcription: Transcription; raw: string }> {
  const model = api()
  if (!model) throw new Error('This browser has no built-in model.')
  const session = await model.create({
    ...options,
    initialPrompts: [{ role: 'system', content: instructions }],
    monitor: (monitor) =>
      monitor.addEventListener('downloadprogress', (event) => onProgress?.((event as ProgressEvent).loaded)),
    signal,
  })
  try {
    const raw = await session.prompt(
      [
        {
          role: 'user',
          content: [
            { type: 'text', value: 'These are photos of the item. Transcribe the fields.' },
            ...images.map((image) => ({ type: 'image', value: image })),
          ],
        },
      ],
      { responseConstraint: schema, signal },
    )
    return { transcription: parseTranscription(raw), raw }
  } finally {
    session.destroy()
  }
}
