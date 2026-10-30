import { getNode, type Doc, type Key, type Value } from '../doc/model'
import { principals } from '../doc/resources'
import { belongsOn, domainOf } from '../schema/fields'
import { refName, termLabel, typesOf, type RefLabel } from './labels'
import {
  identifierMarc,
  provisionMarc,
  recordProps,
  sections,
  structural,
  type FieldSpec,
  type ResourceKind,
} from './presentation'

/**
 * What the description view shows, worked out from the document and the
 * presentation sidecar, apart from React so it can be tested on its own.
 */

export interface Row {
  /** Stable across renders, for React. */
  id: string
  label: string
  marc?: string
  /** The resource the values are saved with, for the Work/Instance badge. */
  resource: ResourceKind
  /** The node and property the values hang on. */
  node: Key
  prop: string
  values: Value[]
  /** On the last row of a field: what "Add another" adds, such as "Contributor". */
  addAnother?: string
  /** Set when the ontology puts the property on another class: the makings of a teaching note. */
  misplaced?: Misplaced
}

/** A property on a resource the ontology doesn't put it on, such as Dimensions on the Work. */
export interface Misplaced {
  /** The class it belongs on, from its rdfs:domain. */
  domain: string
  /** The other resource in the description, where it does belong, if there is one. */
  moveTo?: { resource: ResourceKind; node: Key }
}

/** A field a section offers that the description doesn't have yet, and where a value for it would go. */
export interface Missing {
  id: string
  label: string
  marc?: string
  resource: ResourceKind
  node: Key
  prop: string
}

export interface SectionView {
  title: string
  rows: Row[]
  missing: Missing[]
}

export interface Layout {
  sections: SectionView[]
  /** Properties no section claims, so nothing in the description is hidden. */
  other: Row[]
  /** Administrative metadata about the descriptions themselves. */
  record: Row[]
}

export function layout(doc: Doc, labels: Map<string, RefLabel>): Layout {
  const { instance, work } = principals(doc)
  const resources: [ResourceKind, Key][] = [['Instance', instance]]
  if (work) resources.push(['Work', work])

  // Only a note, never a block: bibframe-json reads the ontology as warnings.
  const misplacement = (key: Key, prop: string): { misplaced?: Misplaced } => {
    const domain = domainOf(prop)
    if (!domain || belongsOn(prop, typesOf(getNode(doc, key)))) return {}
    const other = resources.find(([, node]) => node !== key && belongsOn(prop, typesOf(getNode(doc, node))))
    return { misplaced: { domain, moveTo: other && { resource: other[0], node: other[1] } } }
  }

  const claimed = new Set<string>()
  const rowsFor = (spec: FieldSpec): Row[] =>
    resources.flatMap(([kind, key]) => {
      if (spec.on && spec.on !== kind) return []
      const values = getNode(doc, key).props[spec.prop]
      if (!values?.length) return []
      claimed.add(`${key} ${spec.prop}`)
      const row = { resource: kind, node: key, prop: spec.prop, ...misplacement(key, spec.prop) }
      if (!spec.perValue) {
        return [
          { ...row, id: `${key} ${spec.prop}`, label: spec.label, marc: spec.marc, values, addAnother: spec.label },
        ]
      }
      return values.map((value, i) => ({
        ...row,
        id: value.key,
        ...perValueLabel(doc, spec, kind, value, labels),
        values: [value],
        addAnother: i === values.length - 1 ? spec.label : undefined,
      }))
    })

  const homeOf = (spec: FieldSpec): [ResourceKind, Key] | undefined => {
    const kind =
      spec.home ?? spec.on ?? (belongsOn(spec.prop, typesOf(getNode(doc, instance))) ? 'Instance' : 'Work')
    return resources.find(([resource]) => resource === kind)
  }

  const laidOut = sections.map((section) => {
    const fields = section.fields.map((spec) => ({ spec, rows: rowsFor(spec) }))
    const missing = fields.flatMap(({ spec, rows }) => {
      const home = rows.length === 0 ? homeOf(spec) : undefined
      if (!home) return []
      const [resource, node] = home
      return [{ id: `${node} ${spec.prop}`, label: spec.label, marc: spec.marc, resource, node, prop: spec.prop }]
    })
    return { title: section.title, rows: fields.flatMap(({ rows }) => rows), missing }
  })

  const leftovers = (keep: (prop: string, kind: ResourceKind) => boolean): Row[] =>
    resources.flatMap(([kind, key]) =>
      Object.entries(getNode(doc, key).props)
        .filter(([prop]) => !claimed.has(`${key} ${prop}`) && keep(prop, kind))
        .map(([prop, values]) => ({
          id: `${key} ${prop}`,
          label: termLabel(prop),
          resource: kind,
          node: key,
          prop,
          values,
          addAnother: termLabel(prop),
          ...misplacement(key, prop),
        })),
    )

  return {
    sections: laidOut,
    other: leftovers((prop, kind) => !recordProps.includes(prop) && !structural[kind].includes(prop)),
    record: leftovers((prop) => recordProps.includes(prop)),
  }
}

function perValueLabel(
  doc: Doc,
  spec: FieldSpec,
  kind: ResourceKind,
  value: Value,
  labels: Map<string, RefLabel>,
): { label: string; marc?: string } {
  if (!('node' in value)) return { label: spec.label, marc: spec.marc }
  const node = getNode(doc, value.node)
  const types = typesOf(node)
  switch (spec.perValue) {
    case 'contribution': {
      // Labelled by role, as a cataloger names the field: "Author", not "Contribution".
      const role = node.props.role?.[0]
      const roleId = role && 'node' in role ? getNode(doc, role.node).keywords['@id'] : undefined
      const label = typeof roleId === 'string' ? capitalize(refName(roleId, labels)) : spec.label
      const primary = types.includes('PrimaryContribution')
      return { label, marc: kind === 'Work' && primary ? '100' : '700' }
    }
    case 'identifier': {
      const type = types.find((t) => t !== 'Identifier') ?? 'Identifier'
      return { label: termLabel(type), marc: identifierMarc[type] }
    }
    case 'provision': {
      const type = types.find((t) => provisionMarc[t]) ?? types[0]
      return { label: type ? termLabel(type) : spec.label, marc: type ? (provisionMarc[type] ?? '264') : '264' }
    }
    default:
      return { label: spec.label, marc: spec.marc }
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
