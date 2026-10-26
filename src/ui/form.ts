import { getNode, type Doc, type Json, type Key } from '../doc/model'
import { definitionOf, kindOf, subclasses, type Kind } from '../schema/fields'
import { isUri, termLabel, typesOf } from './labels'
import { describedInPlace, linkedProperties } from './presentation'

/**
 * What kind of value a property takes on a given node, as the schema says, or
 * undefined when neither linked.json nor the ontology says.
 */
export function schemaKind(doc: Doc, node: Key, prop: string): Kind | undefined {
  return kindOf(definitionOf(typesOf(getNode(doc, node))), prop)
}

/** As schemaKind, falling back on the sidecar's list of linked properties, then text. */
export function fieldKind(doc: Doc, node: Key, prop: string): Kind {
  return schemaKind(doc, node, prop) ?? (linkedProperties.has(prop) ? { kind: 'ref' } : { kind: 'text' })
}

/**
 * How a new value is entered: typed text; a label for a node described in
 * place, such as an Extent; a URI (with its label) for a link; or a choice of
 * type for a node with a subform, such as which kind of Identifier.
 */
export type Entry =
  | { entry: 'text' }
  | { entry: 'label'; type: string }
  | { entry: 'link' }
  | { entry: 'node'; types: string[]; preferred: string }

export function entryFor(kind: Kind): Entry {
  switch (kind.kind) {
    case 'text':
      return { entry: 'text' }
    case 'ref':
      return kind.range && describedInPlace.has(kind.range) ? { entry: 'label', type: kind.range } : { entry: 'link' }
    case 'node': {
      // The range itself first, then its subclasses by label: Identifier, then DOI, EAN, ISBN…
      const types = subclasses(kind.range).toSorted((a, b) =>
        a === kind.range ? -1 : b === kind.range ? 1 : termLabel(a).localeCompare(termLabel(b)),
      )
      return { entry: 'node', types, preferred: kind.range }
    }
  }
}

/** The JSON of a new value, or null if what was entered isn't one yet. */
export function newValue(
  entry: Entry,
  input: { text?: string; uri?: string; label?: string; type?: string },
): Json | null {
  const text = input.text?.trim() ?? ''
  switch (entry.entry) {
    case 'text':
      return text || null
    case 'label':
      return text ? { '@type': [entry.type], 'rdfs:label': [text] } : null
    case 'link': {
      const uri = input.uri?.trim() ?? ''
      if (!isUri(uri)) return null
      const label = input.label?.trim()
      // The label is kept with the link, so it displays even when its source is down.
      return label ? { '@id': uri, 'rdfs:label': [label] } : { '@id': uri }
    }
    case 'node':
      return { '@type': [input.type ?? entry.preferred] }
  }
}
