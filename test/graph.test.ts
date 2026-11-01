import { describe, expect, it } from 'vitest'

import { normalize, type JsonObject } from '../src/doc/model'
import { linkedResource, principals, unsaved } from '../src/doc/resources'
import { recordGraph } from '../src/ui/recordGraph'
import { refLabels } from '../src/ui/labels'
import { example } from './fixtures'

function graphOf(json: JsonObject) {
  const doc = normalize(json)
  return recordGraph(doc, refLabels(doc))
}

/** A small record: an Instance and its Work, with whatever the Work says. */
function record(work: JsonObject): JsonObject {
  return {
    '@id': 'http://localhost/instances/1',
    '@type': ['Instance'],
    title: [{ '@type': ['Title'], mainTitle: ['The crying of lot 49'] }],
    extent: [{ '@type': ['Extent'], 'rdfs:label': ['183 pages'] }],
    instanceOf: [{ '@id': 'http://localhost/works/1', '@type': ['Work', 'Text'], ...work }],
  }
}

const groups = (graph: ReturnType<typeof graphOf>) =>
  graph.groups.map((group) => [group.resource, group.label, group.nodes.map((node) => node.label)])

describe('the record as a graph', () => {
  it('groups what each resource links to by relationship, in the record’s order', () => {
    const graph = graphOf(example('bounded'))
    expect(graph.title).toBe('A short history of Sanskrit literature')
    expect(groups(graph)).toContainEqual(['Work', 'Subjects', ['Sanskrit literature--History and criticism']])
    expect(groups(graph)).toContainEqual(['Instance', 'Carrier', ['volume']])
    const labels = graph.groups.map((group) => group.label)
    // Contributors before subjects before carrier, as the sections run.
    expect(labels.indexOf('Contributor')).toBeLessThan(labels.indexOf('Subjects'))
    expect(labels.indexOf('Subjects')).toBeLessThan(labels.indexOf('Carrier'))
  })

  it('names a contributor’s relationship by role', () => {
    const graph = graphOf(
      record({
        contribution: [
          {
            '@type': ['Contribution', 'PrimaryContribution'],
            agent: [{ '@id': 'http://id.loc.gov/rwo/agents/n79070883', 'rdfs:label': ['Pynchon, Thomas'] }],
            role: [{ '@id': 'http://id.loc.gov/vocabulary/relators/aut', 'rdfs:label': ['author'] }],
          },
        ],
      }),
    )
    expect(groups(graph)).toEqual([['Work', 'Author', ['Pynchon, Thomas']]])
    expect(graph.groups[0]?.nodes[0]).toMatchObject({ kind: 'linked', uri: 'http://id.loc.gov/rwo/agents/n79070883' })
  })

  it('draws a complex subject as one node, and text where a link belongs as a dead end', () => {
    const graph = graphOf(
      record({
        subject: [
          {
            '@type': ['Topic', 'mads:ComplexSubject'],
            'mads:authoritativeLabel': ['Women--Fiction'],
          },
          { '@type': ['Topic'], 'rdfs:label': ['Paranoia'] },
        ],
      }),
    )
    expect(graph.groups[0]?.nodes.map((node) => [node.kind, node.label])).toEqual([
      ['complex', 'Women--Fiction'],
      ['unlinked', 'Paranoia'],
    ])
  })

  it('leaves out transcribed text and the link between the two resources', () => {
    const graph = graphOf(record({}))
    expect(graph.groups).toEqual([])
  })

  it('goes to each value in the record', () => {
    const graph = graphOf(example('bounded'))
    for (const group of graph.groups) for (const node of group.nodes) expect(node.valueKey).toBeTruthy()
  })
})

describe('the JSON view', () => {
  it('shows as saved exactly the documents a save sends', () => {
    const doc = normalize(example('bounded'))
    const { instance, work } = principals(doc)
    const sent = new Map(unsaved(doc, {}).map(({ key, json }) => [key, json]))
    expect(linkedResource(doc, instance)).toEqual(sent.get(instance))
    if (work) expect(linkedResource(doc, work)).toEqual(sent.get(work))
  })
})
