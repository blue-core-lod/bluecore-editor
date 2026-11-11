import { blankDescription, placeholderUri } from '../src/doc/blank'
import { replay } from '../src/doc/log'
import { getNode, normalize, type Doc } from '../src/doc/model'
import { principals } from '../src/doc/resources'
import guidance from '../src/schema/guidance.json'
import overrides from '../src/schema/guidance-overrides.json'
import { kindChange, kindShare, overridesFor, usage, type Tier } from '../src/schema/guidance'
import resourceTypes from '../src/schema/resource-types.json'
import { layout, type Missing } from '../src/ui/layout'

/**
 * The field profile of each kind of resource, as Markdown for docs/profiles/:
 * what a new record of the kind offers, section by section, worked out by the
 * editor's own layout code from guidance.json and guidance-overrides.json.
 * Written by scripts/write-profiles.mjs; test/profiles.test.ts checks the committed
 * files are current.
 */

interface Measured {
  share: number
  kinds?: Record<string, number>
}

type Kind = (typeof resourceTypes.types)[number]

const measured = guidance.types as unknown as Record<string, Record<'Instance' | 'Work', Record<string, Measured>>>
const { shown, suggested } = overrides.thresholds

export function renderProfiles(): Record<string, string> {
  const files: Record<string, string> = { 'README.md': index() }
  for (const kind of resourceTypes.types) files[`${kind.id}.md`] = profile(kind)
  return files
}

function index(): string {
  const rows = resourceTypes.types.map(
    (kind) => `| [${kind.label}](${kind.id}.md) | ${defining(kind)} | ${sampled(kind.id)} |`,
  )
  return [
    '# Field profiles',
    '',
    generated,
    '',
    `What a new record of each kind offers, the way a Sinopia template lists its fields. Each is worked out by the editor's own layout code from LC's records (\`src/schema/guidance.json\`) and the hand corrections (\`src/schema/guidance-overrides.json\`). The rules are in [which-fields.md](../which-fields.md).`,
    '',
    'The kinds are checked in this order, and the first that matches a record wins.',
    '',
    '| Kind | Defined by | Records measured |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

function profile(kind: Kind): string {
  const doc = newRecord(kind.id)
  const view = layout(doc, new Map())
  const lines = [
    `# ${kind.label}`,
    '',
    generated,
    '',
    `Measured on ${sampled(kind.id)} of LC's ${kind.plural}. A field is **shown** when ${percent(shown)} or more of them have it, and **suggested** at ${percent(suggested)} to ${percent(shown)}, unless an override says otherwise. An existing record also gets a row for every value it has, whatever its tier. [All kinds](README.md) · [The rules](../which-fields.md)`,
    '',
    '## Defined by',
    '',
    `A record is ${article(kind.label)} ${kind.label.toLowerCase()} when ${defining(kind)}${resourceTypes.types.indexOf(kind) > 0 ? ', and no kind above it in [the list](README.md) matches first' : ''}. ${kindChange(blankRecord(), kind.id) === null ? 'A new record starts as one, with' : `Choosing ${kind.label.toLowerCase()} for a new record writes`}: ${starting(doc)}.`,
    '',
    ...overrideSection(kind),
  ]
  for (const section of view.sections) {
    const fields = [
      ...section.missing.map((field) => ({ field, tier: 'Shown' })),
      ...section.suggested.map((field) => ({ field, tier: 'Suggested' })),
    ]
    if (fields.length === 0) continue
    lines.push(`## ${section.title}`, '', '| Field | Property | On | MARC | Share | Tier |', '|---|---|---|---|---|---|')
    for (const { field, tier } of fields) lines.push(fieldRow(kind.id, field, tier))
    lines.push('')
  }
  const rare = available(kind.id)
  if (rare.length > 0) {
    lines.push(
      '## Available through Add field',
      '',
      `Properties some of LC's ${kind.plural} have that the sections don't offer: under ${percent(suggested)} of them, or moved here by an override. Add field offers these and every other BIBFRAME property, with their shares.`,
      '',
      rare.map(({ prop, share, override }) => `${property(prop)} ${percent(share)}${override ? ' (override)' : ''}`).join(', '),
      '',
    )
  }
  lines.push('## Never offered', '', `Record-keeping and structure, whatever their share: ${overrides.never.map(property).join(', ')}.`, '')
  return lines.join('\n')
}

/** The kind's hand corrections, each with the tier its share alone would give and why it was changed. */
function overrideSection(kind: Kind): string[] {
  const corrections = overridesFor(kind.id)
  const heading = ['## Overrides', '']
  if (corrections.length === 0) return [...heading, 'None: every tier here comes from the measured share.', '']
  return [
    ...heading,
    `Tiers set by hand in \`src/schema/guidance-overrides.json\`, whatever their share among LC's ${kind.plural}.`,
    '',
    '| Property | Share | Measured tier | Set to | Why |',
    '|---|---|---|---|---|',
    ...corrections.map(({ prop, tier, reason }) => {
      const found = usage(kind.id, prop)
      return `| ${property(prop)} | ${percent(found?.share ?? 0)} | ${tierName(found?.override?.measured ?? tier)} | ${tierName(tier)} | ${reason} |`
    }),
    '',
  ]
}

function tierName(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

const generated = '<!-- Generated by `npm run profiles`; edit scripts/profiles.ts or the guidance files, not this. -->'

function blankRecord(): Doc {
  return normalize(blankDescription(placeholderUri('profile')))
}

/** An empty record made the kind, as a cataloger would from the header menu. */
function newRecord(id: string): Doc {
  const doc = blankRecord()
  const change = kindChange(doc, id)
  return change ? replay(doc, [change]) : doc
}

function fieldRow(type: string, field: Missing, tier: string): string {
  const share = field.share ?? 0
  const override = usage(type, field.prop)?.override
  const kinds = typedShares(type, field.prop)
  return [
    '',
    field.label,
    property(field.prop) + (kinds ? `<br>${kinds}` : ''),
    field.resource,
    field.marc ?? '',
    percent(share),
    override ? `${tier} (override)` : tier,
    '',
  ].join(' | ').trim()
}

/**
 * For a property whose values are typed nodes, the kinds that 10% or more of
 * records use: "Lccn 100%, Isbn 76%". Left out when it would only name the
 * property's own class, as Extent for extent.
 */
function typedShares(type: string, prop: string): string {
  const resources = ['Instance', 'Work'] as const
  const classes = new Set(resources.flatMap((resource) => Object.keys(measured[type]?.[resource][prop]?.kinds ?? {})))
  const common = [...classes]
    .map((cls) => ({ cls, share: kindShare(type, prop, cls) ?? 0 }))
    .filter(({ share }) => share >= suggested)
    .toSorted((a, b) => b.share - a.share)
  if (common.length === 1 && common[0]?.cls.toLowerCase() === prop.toLowerCase()) return ''
  return common.map(({ cls, share }) => `${cls} ${percent(share)}`).join(', ')
}

function available(type: string): { prop: string; share: number; override: boolean }[] {
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

function defining(kind: Kind): string {
  const work = (kind.work ?? []).map((type) => `\`${type}\``).join(' or ')
  const issuance = ('issuance' in kind ? (kind.issuance ?? []) : []).map((code) => `\`${code}\``).join(' or ')
  const either = issuance ? `its Work's type is ${work}, or its issuance (\`bf:issuance\`) is ${issuance}` : `its Work's type is ${work}`
  const online = 'online' in kind && kind.online ? `, and its only carrier (\`bf:carrier\`) is \`cr\` (online resource)` : ''
  return either + online
}

/** What a new record of the kind holds before the cataloger enters anything. */
function starting(doc: Doc): string {
  const { instance, work } = principals(doc)
  const parts = [['Instance', instance] as const, ...(work ? [['Work', work] as const] : [])].flatMap(([resource, key]) => {
    const node = getNode(doc, key)
    const types = [node.keywords['@type']].flat().filter((type): type is string => typeof type === 'string' && type !== resource)
    const links = (['issuance', 'carrier'] as const).flatMap((prop) =>
      (node.props[prop] ?? []).flatMap((value) => {
        const id = 'node' in value ? getNode(doc, value.node).keywords['@id'] : undefined
        return typeof id === 'string' ? [`${property(prop)} \`${id.split('/').pop()}\``] : []
      }),
    )
    return [...types.map((type) => `${resource} type \`${type}\``), ...links.map((link) => `${resource} ${link}`)]
  })
  return parts.join(', ')
}

function sampled(type: string): string {
  return String((guidance.types as Record<string, { records: number }>)[type]?.records ?? 0)
}

function property(prop: string): string {
  if (prop.startsWith('http://purl.org/dc/terms/')) return `\`dcterms:${prop.slice('http://purl.org/dc/terms/'.length)}\``
  return prop.includes(':') ? `\`${prop}\`` : `\`bf:${prop}\``
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}
