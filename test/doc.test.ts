import { describe, expect, it } from 'vitest'

import { change, record, replay, undo, type Log } from '../src/doc/log'
import { denormalize, fragment, getNode, normalize, type Doc, type JsonObject, type Value } from '../src/doc/model'
import { apply, ConflictError, without } from '../src/doc/patch'
import {
  assembleBounded,
  changedResources,
  changesWork,
  linkedResource,
  otherInstances,
  principals,
  resourceOf,
} from '../src/doc/resources'
import { acceptedDocuments, example } from './fixtures'

describe('normalize', () => {
  it.each(acceptedDocuments())('round-trips %s', (_name, document) => {
    expect(denormalize(normalize(document))).toEqual(document)
  })

  it('round-trips the example bounded description', () => {
    expect(denormalize(normalize(example('bounded')))).toEqual(example('bounded'))
  })

  it('gives every node and value its own key, outside the document', () => {
    const doc = normalize(example('bounded'))
    const keys = Object.values(doc.nodes).flatMap((node) => [
      node.key,
      ...Object.values(node.props).flatMap((values) => values.map((value) => value.key)),
    ])
    expect(new Set(keys).size).toBe(keys.length)
    expect(JSON.stringify(denormalize(doc))).not.toContain(doc.root)
  })
})

function workOf(doc: Doc): string {
  const { work } = principals(doc)
  if (!work) throw new Error('no Work embedded')
  return work
}

/** The first value of a property, and the node it hangs on, found by walking a path of property names. */
function at(doc: Doc, ...path: string[]): { node: string; prop: string; value: Value } {
  let node = doc.root
  for (const [i, prop] of path.entries()) {
    const value = getNode(doc, node).props[prop]?.[0]
    if (!value) throw new Error(`nothing at ${path.slice(0, i + 1).join('.')}`)
    if (i === path.length - 1) return { node, prop, value }
    if (!('node' in value)) throw new Error(`${prop} holds a literal`)
    node = value.node
  }
  throw new Error('empty path')
}

function titleEdit(doc: Doc, to: string) {
  const { node, prop, value } = at(doc, 'title', 'mainTitle')
  if (!('literal' in value)) throw new Error('mainTitle is not a literal')
  return change(`Changed title to ${to}`, [{ op: 'set', node, prop, value: value.key, from: value.literal, to }])
}

describe('patches', () => {
  it('set replaces a literal and leaves other nodes shared', () => {
    const doc = normalize(example('bounded'))
    const after = replay(doc, [titleEdit(doc, 'A longer history')])
    expect(denormalize(after).title).toEqual([
      { '@type': ['Title'], 'bflc:nonSortNum': ['2'], mainTitle: ['A longer history'] },
    ])
    expect(after.nodes[workOf(doc)]).toBe(doc.nodes[workOf(doc)])
  })

  it('set leaves the property where it was among its siblings', () => {
    // Main title before Subtitle, as Blue Core sends them; editing the first
    // must not move it after the second.
    const doc = normalize({
      '@type': ['Instance'],
      title: [{ '@type': ['Title'], mainTitle: ['COVID-19 in Brooklyn'], subtitle: ['everyday life'] }],
    })
    const title = at(doc, 'title', 'mainTitle')
    const after = replay(doc, [titleEdit(doc, 'COVID-19 in Queens')])
    expect(Object.keys(getNode(after, title.node).props)).toEqual(['mainTitle', 'subtitle'])
  })

  it('keyword changes @type in place', () => {
    const doc = normalize(example('bounded'))
    const { value } = at(doc, 'identifiedBy')
    if (!('node' in value)) throw new Error('identifiedBy holds a literal')
    const before = Object.keys(getNode(doc, value.node).keywords)
    const after = apply(doc, { op: 'keyword', node: value.node, name: '@type', from: ['Isbn'], to: ['Lccn'] })
    expect(Object.keys(getNode(after, value.node).keywords)).toEqual(before)
  })

  it('set refuses a value that has changed since', () => {
    const doc = normalize(example('bounded'))
    const edit = titleEdit(doc, 'First')
    const after = replay(doc, [edit])
    expect(() => replay(after, [edit])).toThrow(ConflictError)
  })

  it('insert and remove a node, with its subtree', () => {
    const doc = normalize(example('bounded'))
    const extent = at(doc, 'extent')
    const { value, nodes } = fragment({ '@type': ['Extent'], 'rdfs:label': ['1 map'] }, extent)
    const inserted = apply(doc, { op: 'insert', ...extent, after: extent.value.key, value, nodes })
    expect(denormalize(inserted).extent).toHaveLength(2)
    expect(Object.keys(inserted.nodes)).toHaveLength(Object.keys(doc.nodes).length + 1)

    const removed = apply(inserted, { op: 'remove', node: extent.node, prop: 'extent', value: value.key })
    expect(denormalize(removed)).toEqual(denormalize(doc))
    expect(Object.keys(removed.nodes)).toHaveLength(Object.keys(doc.nodes).length)
  })

  it('removing the last value drops the property', () => {
    const doc = normalize(example('bounded'))
    const { node, value } = at(doc, 'editionStatement')
    const after = apply(doc, { op: 'remove', node, prop: 'editionStatement', value: value.key })
    expect(denormalize(after)).not.toHaveProperty('editionStatement')
  })

  it('keyword changes @type', () => {
    const doc = normalize(example('bounded'))
    const { value } = at(doc, 'identifiedBy')
    if (!('node' in value)) throw new Error('identifiedBy holds a literal')
    const after = apply(doc, { op: 'keyword', node: value.node, name: '@type', from: ['Isbn'], to: ['Lccn'] })
    expect(getNode(after, value.node).keywords['@type']).toEqual(['Lccn'])
  })
})

describe('undo', () => {
  function logOf(doc: Doc, ...changes: ReturnType<typeof change>[]): { log: Log; current: Doc } {
    return changes.reduce(({ log, current }, next) => record(log, current, next), {
      log: { base: doc, changes: [] } as Log,
      current: doc,
    })
  }

  it('undoes a change out of order when nothing depends on it', () => {
    const doc = normalize(example('bounded'))
    const title = titleEdit(doc, 'Retitled')
    const edition = at(doc, 'editionStatement')
    const editionChange = change('Removed edition', [
      { op: 'remove', node: edition.node, prop: 'editionStatement', value: edition.value.key },
    ])
    const { log } = logOf(doc, title, editionChange)

    const result = undo(log, [title.id])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.log.changes).toEqual([editionChange])
    const json = denormalize(result.current)
    expect(json.title).toEqual(example('bounded').title)
    expect(json).not.toHaveProperty('editionStatement')
  })

  it('names the later changes that depend on the one being undone', () => {
    const doc = normalize(example('bounded'))
    const extent = at(doc, 'extent')
    const { value, nodes } = fragment({ '@type': ['Extent'], 'rdfs:label': ['1 map'] }, extent)
    const add = change('Added extent', [{ op: 'insert', ...extent, after: extent.value.key, value, nodes }])
    const [extentNode] = nodes
    const label = extentNode?.props['rdfs:label']?.[0]
    if (!extentNode || !label) throw new Error('the fragment has no label')
    const edit = change('Edited extent', [
      { op: 'set', node: extentNode.key, prop: 'rdfs:label', value: label.key, from: '1 map', to: '2 maps' },
    ])
    const { log } = logOf(doc, add, edit)

    expect(undo(log, [add.id])).toEqual({ ok: false, dependents: [edit] })
    const both = undo(log, [add.id, edit.id])
    expect(both.ok && denormalize(both.current)).toEqual(example('bounded'))
  })
})

describe('resources', () => {
  it('splits off the Instance with its Work as a bare URI, as the linked example has it', () => {
    const doc = normalize(example('bounded'))
    const instance = linkedResource(doc, doc.root)
    expect(instance.instanceOf).toEqual(example('linked').instanceOf)
    // Everything else stays as the bounded description has it, including the
    // labels of referenced resources (carrier, media) that the stored linked
    // form leaves out; Blue Core treats those as references and never
    // overwrites the resources they describe.
    expect(without(instance, 'instanceOf')).toEqual(without(example('bounded'), 'instanceOf'))
  })

  it('reassembles the bounded description from its linked resources', () => {
    const doc = normalize(example('bounded'))
    const assembled = assembleBounded(linkedResource(doc, doc.root), linkedResource(doc, workOf(doc)))
    expect(assembled).toEqual(example('bounded'))
  })

  it('knows which resource a value is saved with', () => {
    const doc = normalize(example('bounded'))
    expect(resourceOf(doc, at(doc, 'title').node)).toBe(doc.root)
    expect(resourceOf(doc, at(doc, 'instanceOf', 'title', 'mainTitle').node)).toBe(workOf(doc))
  })

  it('reports only the resources a change touched, and none once it is undone', () => {
    const doc = normalize(example('bounded'))
    const workTitle = at(doc, 'instanceOf', 'title', 'mainTitle')
    if (!('literal' in workTitle.value)) throw new Error('mainTitle is not a literal')
    const edit = change('Changed the Work title', [
      { op: 'set', ...workTitle, value: workTitle.value.key, from: workTitle.value.literal, to: 'Sanskrit' },
    ])
    const after = replay(doc, [edit])
    expect(changedResources(doc, after)).toEqual([workOf(doc)])
    expect(changedResources(doc, replay(doc, []))).toEqual([])
  })
})

describe('shared Works', () => {
  /** The example, its Work shared with another Instance. */
  function shared(): Doc {
    const bounded = example('bounded')
    const [work] = bounded.instanceOf as JsonObject[]
    if (!work) throw new Error('no Work')
    const other = 'https://bibframe.example/instances/other'
    return normalize({ ...bounded, instanceOf: [{ ...work, hasInstance: [...(work.hasInstance as string[]), other] }] })
  }

  it('finds the other Instances a Work describes, leaving out this one', () => {
    expect(otherInstances(normalize(example('bounded')))).toEqual([])
    expect(otherInstances(shared())).toEqual(['https://bibframe.example/instances/other'])
  })

  it('tells an edit to the Work, or to anything inside it, from one to the Instance', () => {
    const doc = shared()
    const { instance, work } = principals(doc)
    if (!work) throw new Error('no Work')
    const removeFrom = (node: string, prop: string) => {
      const value = getNode(doc, node).props[prop]?.[0]
      if (!value) throw new Error(`no ${prop}`)
      return change('Removed', [{ op: 'remove', node, prop, value: value.key }])
    }
    expect(changesWork(doc, removeFrom(work, 'subject'))).toBe(true)
    expect(changesWork(doc, removeFrom(instance, 'extent'))).toBe(false)
    // Inside the Work's title, a node of its own.
    const title = getNode(doc, work).props.title?.[0]
    if (!title || !('node' in title)) throw new Error('no Work title')
    expect(changesWork(doc, removeFrom(title.node, 'mainTitle'))).toBe(true)
  })
})
