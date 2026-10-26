import linked from './bibframe-json/linked.json'
import ontology from './bibframe-json/ontology.json'
import vocabulary from './bibframe-json/vocabulary.json'

/**
 * What the schema says about a property, in the terms the form needs: is its
 * value typed, linked, or described in place, which classes may it take, and
 * where does it belong. bibframe-json's hand-written definitions answer first;
 * the ontology's domains and ranges cover the properties they don't model
 * (design.md, Appendix A).
 */

export type Kind =
  /** A literal: a text field. */
  | { kind: 'text' }
  /** Something the description points at: a link, or a small node such as an Extent. `range` is its class. */
  | { kind: 'ref'; range?: string }
  /** A node the description holds, checked against one of linked.json's definitions: a subform. */
  | { kind: 'node'; definition: string; range: string }

interface PropertySchema {
  items?: { $ref?: string; allOf?: { $ref?: string; $comment?: string }[] }
}

const definitions = linked.$defs as unknown as Record<string, { properties?: Record<string, PropertySchema> }>
const classes = ontology.$defs.class as unknown as Record<string, { anyOf?: { enum?: string[] }[] }>
const ontologyProperties = ontology.$defs.node.properties as unknown as Record<string, PropertySchema>

/** Definitions a node can be checked against, most specific first; Resource is everything's fallback. */
const nodeDefinitions = Object.keys(definitions).filter((name) => !['Ref', 'Text', 'Resource'].includes(name))

/** A class and every class under it, as the ontology lists them. */
export function subclasses(cls: string): string[] {
  return classes[cls]?.anyOf?.[0]?.enum ?? [cls]
}

/** The linked.json definition for a node with these types: an Isbn is an Identifier, a Publication a ProvisionActivity. */
export function definitionOf(types: readonly string[]): string | undefined {
  return nodeDefinitions.find((name) => types.some((type) => subclasses(name).includes(type)))
}

export function kindOf(definition: string | undefined, prop: string): Kind | undefined {
  const modeled = definition ? definitions[definition]?.properties?.[prop]?.items?.$ref : undefined
  const range = rangeOf(prop)
  if (modeled) {
    const name = modeled.split('/').pop() ?? ''
    if (name === 'Text') return { kind: 'text' }
    if (name === 'Ref') return { kind: 'ref', range }
    return { kind: 'node', definition: name, range: range ?? name }
  }
  const ontological = ontologyProperties[prop]?.items?.allOf?.[0]
  if (!ontological) return undefined
  if (ontological.$ref === '#/$defs/literal') return { kind: 'text' }
  if (!range) return undefined
  const rangeDefinition = definitionOf([range])
  return rangeDefinition ? { kind: 'node', definition: rangeDefinition, range } : { kind: 'ref', range }
}

/** The class a property's values belong to, from its rdfs:range. */
function rangeOf(prop: string): string | undefined {
  const comment = ontologyProperties[prop]?.items?.allOf?.[0]?.$comment
  return comment?.match(/^rdfs:range (\S+)/)?.[1]
}

/** Where each property belongs, from its rdfs:domain. */
const domains = new Map(
  (ontology.$defs.node.allOf as { $comment?: string }[]).flatMap(({ $comment }) => {
    const match = $comment?.match(/^rdfs:domain (\S+): where (\S+) belongs$/)
    return match?.[1] && match[2] ? [[match[2], match[1]] as const] : []
  }),
)

/** Whether a property may go on a node of these types; one with no domain may go anywhere. */
export function belongsOn(prop: string, types: readonly string[]): boolean {
  const domain = domains.get(prop)
  return !domain || types.some((type) => subclasses(domain).includes(type))
}

/** Properties a definition models, the fields its subform offers before anything is filled in. */
export function modeledProperties(definition: string): string[] {
  return Object.keys(definitions[definition]?.properties ?? {}).filter(
    (prop) => !prop.startsWith('@') && prop !== 'rdfs:label',
  )
}

/** Every BIBFRAME property there is, for "Add field": the vocabulary's terms that aren't classes. */
export const allProperties: string[] = Object.keys(vocabulary.terms).filter((term) => /^[a-z]/.test(term))
