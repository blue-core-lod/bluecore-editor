import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadBounded } from '../src/api/bluecore'
import { instanceUri, isBluecore } from '../src/api/endpoints'
import { getNode, normalize, type Doc, type JsonObject } from '../src/doc/model'
import { without } from '../src/doc/patch'
import { applyChange, change } from '../src/doc/log'
import { linkedResource, moveOps, principals } from '../src/doc/resources'
import { refLabels } from '../src/ui/labels'
import { layout, type Row } from '../src/ui/layout'
import { marcLinks } from '../src/ui/presentation'
import { example } from './fixtures'

function rowsOf(doc: Doc): Row[] {
  const view = layout(doc, refLabels(doc))
  return [...view.sections.flatMap((section) => section.rows), ...view.other, ...view.record]
}

describe('layout', () => {
  it('shows every property of the Instance and the Work once, apart from the links between them', () => {
    const doc = normalize(example('bounded'))
    const { instance, work } = principals(doc)
    if (!work) throw new Error('no Work embedded')
    const expected = [
      ...Object.keys(getNode(doc, instance).props).filter((prop) => prop !== 'instanceOf').map((prop) => `${instance} ${prop}`),
      ...Object.keys(getNode(doc, work).props).filter((prop) => prop !== 'hasInstance').map((prop) => `${work} ${prop}`),
    ]
    const shown = [...new Set(rowsOf(doc).map((row) => `${row.node} ${row.prop}`))]
    expect(shown.toSorted()).toEqual(expected.toSorted())
  })

  it('puts the Instance title and the Work title in the title section, badged by resource', () => {
    const doc = normalize(example('bounded'))
    const [titles] = layout(doc, refLabels(doc)).sections
    expect(titles?.title).toBe('Title and statement of responsibility')
    const titleRows = titles?.rows.filter((row) => row.prop === 'title')
    expect(titleRows?.map((row) => [row.label, row.resource, row.marc])).toEqual([
      ['Title', 'Instance', '245'],
      ['Preferred title', 'Work', '240'],
    ])
  })

  it('finds a property on the resource that has it, wherever the sidecar expects it', () => {
    const bounded = example('bounded')
    const [work] = bounded.instanceOf as JsonObject[]
    if (!work || !bounded.extent) throw new Error('the example has no Work or extent')
    const moved = { ...without(bounded, 'extent'), instanceOf: [{ ...work, extent: bounded.extent }] }
    const extent = rowsOf(normalize(moved)).find((row) => row.prop === 'extent')
    expect(extent?.resource).toBe('Work')
  })

  it('labels each contributor by role, taking the label from wherever the role was embedded', () => {
    // Blue Core embeds a resource once, so the second author's role is a bare @id.
    const aut = 'http://id.loc.gov/vocabulary/relators/aut'
    const doc = normalize({
      '@id': 'http://localhost/instances/1',
      '@type': ['Instance'],
      instanceOf: [
        {
          '@id': 'http://localhost/works/1',
          '@type': ['Work'],
          contribution: [
            {
              '@type': ['Contribution', 'PrimaryContribution'],
              agent: [{ '@id': 'http://id.loc.gov/rwo/agents/n1', 'rdfs:label': ['Krase, Jerome'] }],
              role: [{ '@id': aut, 'rdfs:label': ['author'] }],
            },
            {
              '@type': ['Contribution'],
              agent: [{ '@id': 'http://id.loc.gov/rwo/agents/n2', 'rdfs:label': ['DeSena, Judith N.'] }],
              role: [{ '@id': aut }],
            },
          ],
        },
      ],
    })
    const contributors = rowsOf(doc).filter((row) => row.prop === 'contribution')
    expect(contributors.map((row) => [row.label, row.marc])).toEqual([
      ['Author', '100'],
      ['Author', '700'],
    ])
  })

  it('labels identifiers by type, with their MARC field', () => {
    const doc = normalize(example('bounded'))
    const isbn = rowsOf(doc).find((row) => row.prop === 'identifiedBy')
    expect([isbn?.label, isbn?.marc]).toEqual(['ISBN', '020'])
  })
})

describe('teaching notes', () => {
  /** The example with dimensions on its Work as well as the Instance. */
  function onTheWork(): Doc {
    const bounded = example('bounded')
    const [work] = bounded.instanceOf as JsonObject[]
    if (!work) throw new Error('the example has no Work')
    return normalize({ ...bounded, instanceOf: [{ ...work, dimensions: ['24 cm'] }] })
  }

  it('says nothing about a description that follows the ontology', () => {
    expect(rowsOf(normalize(example('bounded'))).filter((row) => row.misplaced)).toEqual([])
  })

  it('notes a property on the resource the ontology does not put it on, and where it would go', () => {
    const doc = onTheWork()
    const { instance } = principals(doc)
    const dimensions = rowsOf(doc).filter((row) => row.prop === 'dimensions')
    expect(dimensions.map((row) => [row.resource, row.misplaced])).toEqual([
      ['Instance', undefined],
      ['Work', { domain: 'Instance', moveTo: { resource: 'Instance', node: instance } }],
    ])
  })

  it('moves the values to the other resource, after its own, in one change that undoes whole', () => {
    const doc = onTheWork()
    const { instance, work } = principals(doc)
    const row = rowsOf(doc).find((row) => row.prop === 'dimensions' && row.misplaced)
    if (!row?.misplaced?.moveTo || !work) throw new Error('no misplaced dimensions')
    const moved = applyChange(doc, change('Moved', moveOps(doc, row.node, row.prop, row.values, row.misplaced.moveTo.node)))
    expect(linkedResource(moved, work).dimensions).toBeUndefined()
    expect(linkedResource(moved, instance).dimensions).toEqual([...(example('bounded').dimensions as string[]), '24 cm'])
  })

  it('moves a node with everything below it', () => {
    const bounded = example('bounded')
    const [work] = bounded.instanceOf as JsonObject[]
    if (!work) throw new Error('the example has no Work')
    const publication = { '@type': ['Publication'], place: [{ '@id': 'http://id.loc.gov/vocabulary/countries/nyu', 'rdfs:label': ['New York (State)'] }], date: ['2020'] }
    const doc = normalize({ ...without(bounded, 'provisionActivity'), instanceOf: [{ ...work, provisionActivity: [publication] }] })
    const { instance, work: workKey } = principals(doc)
    const row = rowsOf(doc).find((row) => row.prop === 'provisionActivity')
    if (!row?.misplaced?.moveTo || !workKey) throw new Error('no misplaced publication')
    expect(row.resource).toBe('Work')
    const moved = applyChange(doc, change('Moved', moveOps(doc, row.node, row.prop, row.values, row.misplaced.moveTo.node)))
    expect(linkedResource(moved, instance).provisionActivity).toEqual([publication])
    expect(rowsOf(moved).filter((row) => row.misplaced)).toEqual([])
  })
})

describe('MARC hints', () => {
  it('links each tag to the MARC 21 bibliographic format', () => {
    expect(marcLinks('264 _1')).toEqual([{ tag: '264', href: 'https://www.loc.gov/marc/bibliographic/bd264.html' }])
    expect(marcLinks('300 $a').map(({ tag }) => tag)).toEqual(['300'])
  })
})

describe('endpoints', () => {
  it('makes an Instance URI from a bare UUID', () => {
    expect(instanceUri(' F06785A5-4B98-4B22-824B-743B1C255F32 ')).toBe(
      'http://localhost/instances/f06785a5-4b98-4b22-824b-743b1c255f32',
    )
  })

  it('accepts this Blue Core’s URIs, including a pasted .cbd.jsonld link', () => {
    expect(instanceUri('http://localhost/instances/abc.cbd.jsonld')).toBe('http://localhost/instances/abc')
  })

  it('sends the token only to this Blue Core', () => {
    expect(isBluecore('http://localhost/instances/abc')).toBe(true)
    expect(isBluecore('http://localhost.example.org/instances/abc')).toBe(false)
    expect(isBluecore('https://id.loc.gov/resources/instances/1')).toBe(false)
    expect(instanceUri('https://id.loc.gov/resources/instances/1')).toBeNull()
  })
})

describe('loading', () => {
  const uri = 'http://localhost/instances/abc'
  const respond = (body: unknown, headers: Record<string, string> = {}) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { headers })))

  afterEach(() => vi.unstubAllGlobals())

  it('reads a bounded description and the version of each resource in it', async () => {
    respond(example('bounded'), { 'Bluecore-Instance-ETag': '"i1"', 'Bluecore-Work-ETag': '"w1"' })
    const loaded = await loadBounded(uri)
    expect(loaded.json).toEqual(example('bounded'))
    expect(loaded.etags).toEqual({ instance: '"i1"', work: '"w1"' })
  })

  it('refuses a document in any other context, rather than misreading it', async () => {
    respond({ ...example('bounded'), '@context': { '@vocab': 'http://id.loc.gov/ontologies/bibframe/' } })
    await expect(loadBounded(uri)).rejects.toThrow('not a bibframe-json v0.1 description')
  })
})
