import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { change } from '../src/doc/log'
import { listDrafts, writeDraft } from '../src/drafts/drafts'
import { clearEdits, listEdits, recordEdit, searchEdits } from '../src/drafts/edits'
import { normalize } from '../src/doc/model'
import { snapshot } from '../src/doc/resources'
import { example } from './fixtures'

const instance = 'https://bibframe.example/instances/1'
const work = 'https://bibframe.example/works/1'

function saved(title: string, labels: string[], at: Date, uri = instance) {
  return {
    uri,
    title,
    savedAt: at,
    resources: [
      { kind: 'Work' as const, uri: work, ok: true },
      { kind: 'Instance' as const, uri, ok: true },
    ],
    changes: labels.map((label) => change(label, [])),
  }
}

describe('saved edits', () => {
  it('are listed for their cataloger only, newest first, with what changed', async () => {
    await recordEdit('erin', saved('Lot 49', ['Added Subject: California'], new Date('2026-11-01')))
    await recordEdit('erin', saved('Lot 49', ['Changed Main title: The crying of lot 49'], new Date('2026-11-03')))
    await recordEdit('frank', saved('V.', ['Removed Note'], new Date('2026-11-02')))

    const edits = await listEdits('erin')
    expect(edits.map((edit) => edit.changes.map((c) => c.label))).toEqual([
      ['Changed Main title: The crying of lot 49'],
      ['Added Subject: California'],
    ])
    expect((await listEdits('frank')).map((edit) => edit.title)).toEqual(['V.'])
  })

  it('list one record’s edits when asked', async () => {
    const other = 'https://bibframe.example/instances/2'
    await recordEdit('gail', saved('One', ['Added Note'], new Date(), instance))
    await recordEdit('gail', saved('Two', ['Added Note'], new Date(), other))
    expect((await listEdits('gail', other)).map((edit) => edit.title)).toEqual(['Two'])
  })

  it('don’t list a change again when a save that failed in part is retried', async () => {
    const changes = [change('Added Subject: California', []), change('Removed Note', [])]
    const partial = { ...saved('Lot 49', [], new Date('2026-11-01')), changes }
    await recordEdit('hal', { ...partial, resources: [{ kind: 'Work', uri: work, ok: false }] })
    await recordEdit('hal', { ...partial, savedAt: new Date('2026-11-02') })
    const [retry, first] = await listEdits('hal')
    expect(first?.changes).toHaveLength(2)
    expect(retry?.changes).toEqual([])
  })

  it('are cleared for one cataloger, leaving others’ edits and their own drafts', async () => {
    await recordEdit('ida', saved('Mine', ['Added Note'], new Date()))
    await recordEdit('jo', saved('Theirs', ['Added Note'], new Date()))
    const doc = normalize(example('bounded'))
    await writeDraft('ida', instance, { log: { base: doc, changes: [] }, current: doc, saved: snapshot(doc), etags: {}, loadedAt: new Date() })

    await clearEdits('ida')
    expect(await listEdits('ida')).toEqual([])
    expect(await listEdits('jo')).toHaveLength(1)
    expect(await listDrafts('ida')).toHaveLength(1)
  })

  it('are searched by every word, in titles, URIs and changes', () => {
    const edits = [
      { ...saved('The crying of lot 49', ['Added Subject: California'], new Date()), id: 'a', user: 'k' },
      { ...saved('V.', ['Removed Note'], new Date(), 'https://bibframe.example/instances/v'), id: 'b', user: 'k' },
    ].map((edit) => ({ ...edit, changes: edit.changes.map(({ id, label, at }) => ({ id, label, at })) }))
    expect(searchEdits(edits, '').map((edit) => edit.id)).toEqual(['a', 'b'])
    expect(searchEdits(edits, 'lot california').map((edit) => edit.id)).toEqual(['a'])
    expect(searchEdits(edits, 'instances/v').map((edit) => edit.id)).toEqual(['b'])
    expect(searchEdits(edits, 'lot note')).toEqual([])
  })
})
