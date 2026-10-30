import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUrl } from '../src/api/endpoints'
import { afterSave, saveDescription, type SaveState } from '../src/api/save'
import { blankDescription, isPlaceholder, placeholderUri } from '../src/doc/blank'
import { change, record } from '../src/doc/log'
import { fragment, getNode, normalize, type Doc, type Json } from '../src/doc/model'
import { isEmpty, principals, snapshot, unsaved } from '../src/doc/resources'
import { getValidators } from '../src/schema/validate'
import { example } from './fixtures'

const workUri = 'https://bibframe.example/works/9937996a-1083-4357-b05f-4be85f7b7354'
const instanceUri = 'https://bibframe.example/instances/fb857a3a-f454-4392-ba6d-a3653c12be47'

function opened(): SaveState {
  const doc = normalize(example('bounded'))
  const { instance, work } = principals(doc)
  if (!work) throw new Error('no Work embedded')
  return {
    log: { base: doc, changes: [] },
    current: doc,
    saved: snapshot(doc),
    etags: { [instance]: '"i1"', [work]: '"w1"' },
  }
}

/** Change the main title of the Instance's title, or of the Work's. */
function retitle(state: SaveState, on: 'instance' | 'work', to: string): SaveState {
  const { instance, work } = principals(state.current)
  const owner = getNode(state.current, on === 'instance' ? instance : (work as string))
  const title = owner.props.title?.[0]
  if (!title || !('node' in title)) throw new Error('no title')
  const mainTitle = getNode(state.current, title.node).props.mainTitle?.[0]
  if (!mainTitle || !('literal' in mainTitle)) throw new Error('no mainTitle')
  const edit = change(`Changed title to ${to}`, [
    { op: 'set', node: title.node, prop: 'mainTitle', value: mainTitle.key, from: mainTitle.literal, to },
  ])
  return { ...state, ...record(state.log, state.current, edit) }
}

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** Answer each request by its URL; record what was sent. */
function blueCore(answers: Record<string, () => Response>): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      })
      const answer = answers[url]
      if (!answer) throw new Error(`unexpected request to ${url}`)
      return answer()
    }),
  )
  return calls
}

const ok = (etag: string) => () => new Response('{}', { status: 200, headers: { ETag: etag } })
const changedSince = (etag: string) => () =>
  new Response(JSON.stringify({ detail: 'changed', uri: '', etag }), { status: 412 })

afterEach(() => vi.unstubAllGlobals())

describe('saving', () => {
  it('writes only the resource that changed, to its own URI, against the version read', async () => {
    const state = retitle(opened(), 'work', 'Kāvyaśāstra')
    const calls = blueCore({ [workUri]: ok('"w2"') })

    const results = await saveDescription(state, 'token')

    expect(calls).toHaveLength(1)
    const [put] = calls
    expect(put?.method).toBe('PUT')
    expect(put?.headers).toMatchObject({
      'Content-Type': 'application/ld+json',
      'If-Match': '"w1"',
      Authorization: 'Bearer token',
    })
    // The Work alone, as a linked description of its own, with the Instance only named.
    expect(put?.body['@id']).toBe(workUri)
    expect(put?.body['@context']).toBe(example('bounded')['@context'])
    expect(getValidators().linked(put?.body)).toBe(true)

    const next = afterSave(state, results)
    expect(unsaved(next.current, next.saved)).toEqual([])
    expect(next.log.changes).toEqual([])
    expect(Object.values(next.etags)).toContain('"w2"')
  })

  it('writes the Work before the Instance, and the Instance names its Work by URI', async () => {
    const state = retitle(retitle(opened(), 'work', 'Kāvyaśāstra'), 'instance', 'Poetics')
    const calls = blueCore({ [workUri]: ok('"w2"'), [instanceUri]: ok('"i2"') })

    await saveDescription(state, 'token')

    expect(calls.map((call) => call.url)).toEqual([workUri, instanceUri])
    expect(calls[1]?.body.instanceOf).toEqual([workUri])
    expect(getValidators().linked(calls[1]?.body)).toBe(true)
  })

  it('reports a conflict with the version now in Blue Core, and keeps the changes', async () => {
    const state = retitle(opened(), 'work', 'Kāvyaśāstra')
    blueCore({ [workUri]: changedSince('"w9"') })

    const results = await saveDescription(state, 'token')

    expect(results[0]?.outcome).toEqual({
      ok: false,
      conflict: true,
      message: 'changed in Blue Core since you opened it',
      etag: '"w9"',
    })
    const next = afterSave(state, results)
    expect(next.log.changes).toHaveLength(1)
    expect(unsaved(next.current, next.saved)).toHaveLength(1)
  })

  it('after a partial save, retries only the resource that failed', async () => {
    const state = retitle(retitle(opened(), 'work', 'Kāvyaśāstra'), 'instance', 'Poetics')
    blueCore({ [workUri]: ok('"w2"'), [instanceUri]: changedSince('"i9"') })

    const next = afterSave(state, await saveDescription(state, 'token'))

    const left = unsaved(next.current, next.saved)
    expect(left.map(({ json }) => json['@id'])).toEqual([instanceUri])
    // Still unsaved, so the history stays too.
    expect(next.log.changes).toHaveLength(2)
  })

  it('refuses to write without a version to write against', async () => {
    const state = retitle(opened(), 'work', 'Kāvyaśāstra')
    const { work } = principals(state.current)
    const calls = blueCore({})

    const [result] = await saveDescription({ ...state, etags: { [work as string]: null } }, 'token')

    expect(calls).toEqual([])
    expect(result?.outcome.ok).toBe(false)
  })
})

describe('linked descriptions', () => {
  it('splits the example into an Instance and a Work that each fit linked.json', () => {
    const doc: Doc = normalize(example('bounded'))
    const { linked } = getValidators()
    for (const json of Object.values(snapshot(doc))) expect(linked(json), JSON.stringify(linked.errors)).toBe(true)
  })
})

/** Add a value to a property of the Instance, as AddValue does. */
function addToInstance(state: SaveState, prop: string, json: Json): { state: SaveState; key: string } {
  const { instance } = principals(state.current)
  const after = getNode(state.current, instance).props[prop]?.at(-1)?.key ?? null
  const { value, nodes } = fragment(json, { node: instance, prop })
  const edit = change(`Added ${prop}`, [{ op: 'insert', node: instance, prop, after, value, nodes }])
  return { state: { ...state, ...record(state.log, state.current, edit) }, key: 'node' in value ? value.node : '' }
}

describe('empty nodes', () => {
  it('leaves out a node with only a type, so there is nothing to save', () => {
    const { state, key } = addToInstance(opened(), 'identifiedBy', { '@type': ['Lccn'] })
    expect(isEmpty(state.current, key)).toBe(true)
    expect(unsaved(state.current, state.saved)).toEqual([])
  })

  it('leaves out a node holding only empty nodes, and the property if nothing is left', () => {
    const { state, key } = addToInstance(opened(), 'note', { '@type': ['Note'], 'noteType': [{ '@type': ['Note'] }] })
    expect(isEmpty(state.current, key)).toBe(true)
    expect(unsaved(state.current, state.saved)).toEqual([])
  })

  it('saves the node once it has a value', () => {
    const { state, key } = addToInstance(opened(), 'identifiedBy', { '@type': ['Lccn'], 'rdf:value': ['2020012345'] })
    expect(isEmpty(state.current, key)).toBe(false)
    const [pending] = unsaved(state.current, state.saved)
    expect(JSON.stringify(pending?.json.identifiedBy)).toContain('2020012345')
  })

  it('keeps a node that is a link, though it has nothing else', () => {
    const { state, key } = addToInstance(opened(), 'carrier', { '@id': 'http://id.loc.gov/vocabulary/carriers/nb' })
    expect(isEmpty(state.current, key)).toBe(false)
    expect(unsaved(state.current, state.saved)).toHaveLength(1)
  })
})

describe('new descriptions', () => {
  const minted = { work: 'http://localhost/works/w-new', instance: 'http://localhost/instances/i-new' }
  const created = (uri: string) => () => new Response(JSON.stringify({ uri }), { status: 201 })
  const refused = () => new Response(JSON.stringify({ detail: 'nope' }), { status: 500 })

  /** A new description with a main title added to the Instance's title. */
  function started(): SaveState {
    const doc = normalize(blankDescription(placeholderUri('abc')))
    const { instance } = principals(doc)
    const { value, nodes } = fragment({ '@type': ['Title'], mainTitle: ['A new book'] }, { node: instance, prop: 'title' })
    const edit = change('Added title', [{ op: 'insert', node: instance, prop: 'title', after: null, value, nodes }])
    return { saved: {}, etags: {}, ...record({ base: doc, changes: [] }, doc, edit) }
  }

  it('opens at ?new=<id> and back, so a new description can be reloaded', () => {
    expect(isPlaceholder(placeholderUri('abc'))).toBe(true)
    expect(isPlaceholder(instanceUri)).toBe(false)
    expect(getValidators().bounded(blankDescription(placeholderUri('abc')))).toBe(true)
  })

  it('creates the Work, then the Instance naming the Work by the URI Blue Core minted', async () => {
    const calls = blueCore({ [createUrl('Work')]: created(minted.work), [createUrl('Instance')]: created(minted.instance) })
    const state = started()
    const results = await saveDescription(state, 'token')

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['POST', createUrl('Work')],
      ['POST', createUrl('Instance')],
    ])
    const [work, instance] = calls
    expect(work?.body['@id']).toBe('')
    expect(instance?.body['@id']).toBe('')
    expect(instance?.body.instanceOf).toEqual([minted.work])
    expect(JSON.stringify(calls.map((call) => call.body))).not.toContain('urn:bluecore-editor')

    const after = afterSave(state, results)
    const { instance: instanceKey, work: workKey } = principals(after.current)
    expect(getNode(after.current, instanceKey).keywords['@id']).toBe(minted.instance)
    expect(workKey && getNode(after.current, workKey).keywords['@id']).toBe(minted.work)
    expect(unsaved(after.current, after.saved)).toEqual([])
    expect(results.map((result) => result.uri)).toEqual([minted.work, minted.instance])
  })

  it('keeps the minted Work when the Instance fails, so a retry creates only the Instance', async () => {
    blueCore({ [createUrl('Work')]: created(minted.work), [createUrl('Instance')]: refused })
    const state = started()
    const first = await saveDescription(state, 'token')
    const after = afterSave(state, first)
    expect(first.map((result) => result.outcome.ok)).toEqual([true, false])

    const calls = blueCore({ [createUrl('Instance')]: created(minted.instance) })
    await saveDescription(after, 'token')
    expect(calls.map((call) => call.url)).toEqual([createUrl('Instance')])
    expect(calls[0]?.body.instanceOf).toEqual([minted.work])
  })

  it('doesn’t create the Instance when its Work couldn’t be', async () => {
    const calls = blueCore({ [createUrl('Work')]: refused })
    const results = await saveDescription(started(), 'token')
    expect(calls).toHaveLength(1)
    expect(results[1]?.outcome).toMatchObject({ ok: false, message: expect.stringContaining('Work isn’t in Blue Core') })
  })
})
