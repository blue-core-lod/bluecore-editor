import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { change, record } from '../src/doc/log'
import { denormalize, getNode, normalize } from '../src/doc/model'
import { snapshot } from '../src/doc/resources'
import { deleteDraft, listDrafts, readDraft, restore, writeDraft } from '../src/drafts/drafts'
import { example } from './fixtures'

const uri = 'https://bibframe.example/instances/fb857a3a-f454-4392-ba6d-a3653c12be47'

function edited() {
  const doc = normalize(example('bounded'))
  const edition = getNode(doc, doc.root).props.editionStatement?.[0]
  if (!edition) throw new Error('no edition')
  const removal = change('Removed edition', [
    { op: 'remove', node: doc.root, prop: 'editionStatement', value: edition.key },
  ])
  const { log, current } = record({ base: doc, changes: [] }, doc, removal)
  return { log, current, saved: snapshot(doc), etags: { [doc.root]: '"i1"' }, loadedAt: new Date() }
}

describe('drafts', () => {
  it('keep the changes, and replay to the same description', async () => {
    const state = edited()
    await writeDraft('alice', uri, state)

    const draft = await readDraft('alice', uri)
    if (!draft) throw new Error('no draft')
    const restored = restore(draft)
    expect(restored && denormalize(restored.current)).toEqual(denormalize(state.current))
    expect(restored?.log.changes.map((change) => change.label)).toEqual(['Removed edition'])
    expect(restored?.etags).toEqual(state.etags)
  })

  it('are listed for their cataloger only, most recently changed first', async () => {
    const other = 'https://bibframe.example/instances/other'
    await writeDraft('carol', uri, edited())
    await writeDraft('dave', other, edited())
    await new Promise((resolve) => setTimeout(resolve, 5))
    await writeDraft('carol', other, edited())
    expect((await listDrafts('carol')).map((draft) => draft.uri)).toEqual([other, uri])
  })

  it('are kept per cataloger', async () => {
    await writeDraft('alice', uri, edited())
    expect(await readDraft('bob', uri)).toBeNull()
  })

  it('go once deleted', async () => {
    await writeDraft('alice', uri, edited())
    await deleteDraft('alice', uri)
    expect(await readDraft('alice', uri)).toBeNull()
  })
})
