import { isValueObject, type Json, type JsonObject, type Node } from './model'
import { without } from './patch'

/**
 * Unlinked values: an agent, subject or genre written as text, with no URI,
 * where the field links to authorities. Data converted from MARC is full of
 * them ("Malek, Zacharie, 2000-" as a Person with only a label), and
 * catalogers trained on authorized strings will keep typing them. The editor
 * says so, and makes linking one action; whether to link stays the
 * cataloger's call (design.md, Linked and unlinked values).
 */

const labelProps = ['rdfs:label', 'mads:authoritativeLabel']

/** What the value is called, if it's a node that names something without linking to it. */
export function unlinkedLabel(node: Node): string | undefined {
  if (typeof node.keywords['@id'] === 'string') return undefined
  for (const prop of labelProps) {
    const value = node.props[prop]?.find((value) => 'literal' in value)
    if (value && 'literal' in value) {
      return String(isValueObject(value.literal) ? value.literal['@value'] : value.literal)
    }
  }
  return undefined
}

/** Whether the value is marked uncontrolled on purpose (bflc:Uncontrolled), as some converted headings are. */
export function isUncontrolled(node: Node): boolean {
  const type = node.keywords['@type']
  return Array.isArray(type) && type.includes('bflc:Uncontrolled')
}

/**
 * What the text said that the authority now says, or that no longer holds
 * once it's linked: its label and MARC key, the access points derived from
 * them, and the scheme it said it came from.
 */
const replaced = [...labelProps, 'bflc:marcKey', 'bflc:aap', 'bflc:aap-normalized', 'source', 'mads:isMemberOfMADSScheme']

/**
 * The value linked to the authority picked for it. It keeps its type ("a
 * Person"), less any mark of being uncontrolled, and whatever else it says;
 * it takes the authority's URI, label and MARC key.
 */
export function linked(was: JsonObject, hit: { uri: string; label: string; marcKey?: string }): JsonObject {
  const kept = replaced.reduce<JsonObject>((json, prop) => without(json, prop) as JsonObject, without(was, '@id') as JsonObject)
  const types = Array.isArray(kept['@type']) ? (kept['@type'] as Json[]).filter((type) => type !== 'bflc:Uncontrolled') : []
  return {
    '@id': hit.uri,
    ...(types.length > 0 ? { '@type': types } : {}),
    ...without(kept, '@type'),
    ...(hit.label ? { 'rdfs:label': [hit.label] } : {}),
    ...(hit.marcKey ? { 'bflc:marcKey': [hit.marcKey] } : {}),
  }
}
