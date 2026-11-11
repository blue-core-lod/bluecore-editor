import { blankDescription, placeholderUri } from '../doc/blank'
import { replay } from '../doc/log'
import { getNode, normalize, type Doc } from '../doc/model'
import { principals } from '../doc/resources'
import guidance from '../schema/guidance.json'
import overrides from '../schema/guidance-overrides.json'
import { kindChange, kindShare, overridesFor, usage, type Resource, type ResourceType, type Tier } from '../schema/guidance'
import resourceTypes from '../schema/resource-types.json'
import { layout } from './layout'

/**
 * The field profile of a kind of resource: what a new record of the kind
 * offers, section by section, the way a Sinopia template lists its fields.
 * It's worked out by the same layout code the record view uses, from
 * guidance.json and guidance-overrides.json, so it can't say anything the
 * editor doesn't do. The Fields page shows it.
 */

export interface Profile {
  kind: ResourceType
  thresholds: { shown: number; suggested: number }
  definedBy: Definition
  /** What a new record of the kind holds before the cataloger enters anything. */
  holds: Held[]
  /** Whether a new record starts as this kind, so nothing has to be chosen. */
  startsAs: boolean
  overrides: OverrideRow[]
  sections: { title: string; fields: ProfileField[] }[]
  /** Properties some of LC's records of the kind have that the sections don't offer, most used first. */
  available: { prop: string; share: number; override: boolean }[]
  /** Properties no form offers, whatever their share. */
  never: string[]
}

export interface Definition {
  work: string[]
  issuance: string[]
  /** Whether the only carrier must be an online resource. */
  online: boolean
  /** Whether a kind earlier in the list could match first. */
  afterOthers: boolean
}

export interface Held {
  resource: Resource
  what: 'type' | 'issuance' | 'carrier'
  value: string
}

export interface ProfileField {
  label: string
  prop: string
  resource: Resource
  marc?: string
  share: number
  tier: Tier
  /** Filled in by choosing the kind, such as an online book's carrier. */
  setByKind: boolean
  /**
   * Whether the share is within the sample's margin of a threshold, so a
   * different sample could put it in the next tier: where an override
   * decision is worth making.
   */
  nearThreshold: boolean
  override?: { measured: Tier; reason: string }
  /** For a property whose values are typed nodes, the kinds 10% or more of records use: Lccn, Isbn. */
  typed: { cls: string; share: number }[]
}

export interface OverrideRow {
  prop: string
  share: number
  measured: Tier
  tier: Tier
  reason: string
}

interface Measured {
  share: number
  kinds?: Record<string, number>
}

type Rule = (typeof resourceTypes.types)[number]

const measured = guidance.types as unknown as Record<string, Record<Resource, Record<string, Measured>>>
const sampled = guidance.types as unknown as Record<string, { records: number }>
const { thresholds } = overrides

/**
 * Whether a share is within two standard errors of a threshold, for a sample
 * of this kind's size: about 95% confidence that it's on the side it was
 * measured on, when this says no.
 */
export function nearThreshold(type: string, share: number): boolean {
  const records = sampled[type]?.records ?? 0
  if (records === 0) return false
  return [thresholds.shown, thresholds.suggested].some(
    (threshold) => Math.abs(share - threshold) < 2 * Math.sqrt((threshold * (1 - threshold)) / records),
  )
}

/** The profile of a kind of resource, or undefined for a kind the rules don't know. */
export function profileOf(id: string): Profile | undefined {
  const index = resourceTypes.types.findIndex((rule) => rule.id === id)
  const rule = resourceTypes.types[index]
  if (!rule) return undefined
  const doc = newRecord(id)
  const view = layout(doc, new Map())
  const sections = view.sections
    .map((section) => ({
      title: section.title,
      fields: [
        ...section.rows.flatMap((row) => field(id, row, true)),
        ...section.missing.flatMap((missing) => field(id, missing, false)),
        ...section.suggested.flatMap((suggested) => field(id, suggested, false)),
      ],
    }))
    .filter((section) => section.fields.length > 0)
  return {
    kind: { id: rule.id, label: rule.label, plural: rule.plural },
    thresholds,
    definedBy: definition(rule, index > 0),
    holds: holds(doc),
    startsAs: kindChange(blankRecord(), id) === null,
    overrides: overridesFor(id).map(({ prop, tier, reason }) => {
      const found = usage(id, prop)
      return { prop, share: found?.share ?? 0, measured: found?.override?.measured ?? tier, tier, reason }
    }),
    sections,
    available: available(id),
    never: overrides.never,
  }
}

function blankRecord(): Doc {
  return normalize(blankDescription(placeholderUri('profile')))
}

/** An empty record made the kind, as a cataloger would from the header menu. */
function newRecord(id: string): Doc {
  const doc = blankRecord()
  const change = kindChange(doc, id)
  return change ? replay(doc, [change]) : doc
}

function field(
  type: string,
  spec: { label: string; prop: string; resource: Resource; marc?: string },
  setByKind: boolean,
): ProfileField[] {
  const found = usage(type, spec.prop)
  if (!found) return []
  return [
    {
      label: spec.label,
      prop: spec.prop,
      resource: spec.resource,
      ...(spec.marc ? { marc: spec.marc } : {}),
      share: found.share,
      tier: found.tier,
      setByKind,
      nearThreshold: nearThreshold(type, found.share),
      ...(found.override ? { override: found.override } : {}),
      typed: typed(type, spec.prop),
    },
  ]
}

/** Left out when it would only name the property's own class, as Extent for extent. */
function typed(type: string, prop: string): { cls: string; share: number }[] {
  const resources = ['Instance', 'Work'] as const
  const classes = new Set(resources.flatMap((resource) => Object.keys(measured[type]?.[resource][prop]?.kinds ?? {})))
  const common = [...classes]
    .map((cls) => ({ cls, share: kindShare(type, prop, cls) ?? 0 }))
    .filter(({ share }) => share >= thresholds.suggested)
    .toSorted((a, b) => b.share - a.share)
  return common.length === 1 && common[0]?.cls.toLowerCase() === prop.toLowerCase() ? [] : common
}

function available(type: string): Profile['available'] {
  const kind = measured[type]
  if (!kind) return []
  const props = new Set([...Object.keys(kind.Instance), ...Object.keys(kind.Work)])
  return [...props]
    .flatMap((prop) => {
      const found = usage(type, prop)
      return found?.tier === 'available' && found.share > 0 ? [{ prop, share: found.share, override: !!found.override }] : []
    })
    .toSorted((a, b) => b.share - a.share || a.prop.localeCompare(b.prop))
}

function definition(rule: Rule, afterOthers: boolean): Definition {
  return {
    work: rule.work,
    issuance: 'issuance' in rule ? (rule.issuance ?? []) : [],
    online: 'online' in rule && rule.online === true,
    afterOthers,
  }
}

function holds(doc: Doc): Held[] {
  const { instance, work } = principals(doc)
  const resources: [Resource, typeof instance][] = [['Instance', instance], ...(work ? [['Work', work] as [Resource, typeof work]] : [])]
  return resources.flatMap(([resource, key]) => {
    const node = getNode(doc, key)
    const types = [node.keywords['@type']]
      .flat()
      .filter((type): type is string => typeof type === 'string' && type !== resource)
      .map((value) => ({ resource, what: 'type' as const, value }))
    const links = (['issuance', 'carrier'] as const).flatMap((what) =>
      (node.props[what] ?? []).flatMap((value) => {
        const id = 'node' in value ? getNode(doc, value.node).keywords['@id'] : undefined
        return typeof id === 'string' ? [{ resource, what, value: id.split('/').pop() ?? id }] : []
      }),
    )
    return [...types, ...links]
  })
}

/** A property as a cataloger would look it up: bf:scale, bflc:governmentPubType, dcterms:isPartOf. */
export function propertyName(prop: string): string {
  const dcterms = 'http://purl.org/dc/terms/'
  if (prop.startsWith(dcterms)) return `dcterms:${prop.slice(dcterms.length)}`
  return prop.includes(':') ? prop : `bf:${prop}`
}

/** Rounded down, so a share just under a threshold never reads as the threshold itself: 49.6% is 49%, and suggested. */
export function percent(share: number): string {
  return `${Math.floor(share * 100)}%`
}
