import { Fragment, useMemo, useState, type ReactNode } from 'react'

import { complexSubject, componentsOf, isComplexSubject, joinHeading, subfield, type Component } from '../doc/complex'
import { isUncontrolled, linked, unlinkedLabel } from '../doc/link'
import { change, type Change } from '../doc/log'
import {
  denormalize,
  getNode,
  isValueObject,
  type Doc,
  type Json,
  type Key,
  type Literal,
  type Node,
  type Value,
} from '../doc/model'
import { isEmpty, moveOps, replaceOps } from '../doc/resources'
import { composes, sourcesFor } from '../lookup/sources'
import { belongsOn, definitionOf, domainOf, modeledProperties } from '../schema/fields'
import { hasContext } from '../context/lc'
import { AddField } from './AddField'
import { AddValue } from './AddValue'
import { DescriptionContext, useDescription, type Previewed } from './context'
import { entryFor, fieldKind, schemaKind } from './form'
import { isUri, literalText, refLabels, refName, sourceOf, termLabel, typesOf } from './labels'
import { layout, missingId, type Misplaced, type Missing, type Row, type Suggestion } from './layout'
import { Lookup } from './Lookup'
import { marcLinks, ontologyEntry, primerPage, primerUrl, resourcePrimer, sectionPrimer, type ResourceKind } from './presentation'

/**
 * The description as one document, in cataloging sections, with every value
 * edited where it is shown. Each edit is recorded as a change, never applied
 * to the document directly; the parent replays the log.
 */

export function Description({
  doc,
  hints,
  record,
  selected,
  select,
  preview,
}: {
  doc: Doc
  hints: boolean
  record: (change: Change) => void
  selected: string | null
  select: (uri: string) => void
  preview: (entity: Previewed | null) => void
}) {
  const labels = useMemo(() => refLabels(doc), [doc])
  const view = useMemo(() => layout(doc, labels), [doc, labels])
  const context = useMemo(
    () => ({ doc, labels, hints, record, selected, select, preview }),
    [doc, labels, hints, record, selected, select, preview],
  )

  return (
    <DescriptionContext value={context}>
      <div className={hints ? 'description hints' : 'description'}>
        {view.sections.map((section) => (
          <Section key={section.title} {...section} plural={view.type?.plural} />
        ))}
        {view.other.length > 0 && <Section title="Other fields" rows={view.other} missing={[]} suggested={[]} />}
        <AddField />
        {view.record.length > 0 && (
          <details className="record">
            <summary>
              Record information
              <PrimerLinks title="Record information" />
            </summary>
            {view.record.map((row) => (
              <FieldRow key={row.id} row={{ ...row, addAnother: undefined }} />
            ))}
          </details>
        )}
      </div>
    </DescriptionContext>
  )
}

function Section({
  title,
  rows,
  missing,
  suggested,
  plural,
}: {
  title: string
  rows: Row[]
  missing: Missing[]
  suggested: Suggestion[]
  /** What records of this kind are called, "maps", for the suggestions' figures. */
  plural?: string
}) {
  // A section with nothing in it and nothing this kind of record usually has is left out.
  if (rows.length === 0 && missing.length === 0 && suggested.length === 0) return null
  return (
    <section className="section">
      <h2>
        {title}
        <PrimerLinks title={title} />
      </h2>
      {rows.map((row) => (
        <FieldRow key={row.id} row={row} />
      ))}
      {missing.length > 0 && (
        <div className="missing">
          {missing.map((field) => (
            <span key={field.id} id={missingId(field)}>
              <AddValue
                node={field.node}
                prop={field.prop}
                label={field.label}
                prompt={`Add ${field.label.toLowerCase()}`}
              />
            </span>
          ))}
        </div>
      )}
      {suggested.length > 0 && (
        <div className="suggested">
          <span className="suggested-note">Also used{plural ? ` for ${plural}` : ''}:</span>
          {suggested.map((field) => (
            <AddValue
              key={field.id}
              node={field.node}
              prop={field.prop}
              label={field.label}
              prompt={`${field.label} ${Math.round(field.share * 100)}%`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function FieldRow({ row }: { row: Row }) {
  const { hints } = useDescription()
  return (
    <div className="row">
      <div className="row-label">
        <span>{row.label}</span>
        {hints && row.marc && <MarcTag marc={row.marc} />}
        {hints && <OntologyLink prop={row.prop} />}
      </div>
      <div className="row-values">
        {row.values.map((value) => (
          <ValueView key={value.key} node={row.node} prop={row.prop} value={value} label={row.label} />
        ))}
        {row.addAnother && (
          <div className="add-another">
            <AddValue node={row.node} prop={row.prop} label={row.addAnother} prompt="Add another" />
          </div>
        )}
        {row.misplaced && <TeachingNote row={row} misplaced={row.misplaced} />}
      </div>
      {hints && <Badge kind={row.resource} />}
    </div>
  )
}

/**
 * A quiet note that a field is on a resource the ontology doesn't put it on,
 * with the move one click away. Shown with hints off too: this is where the
 * Work/Instance split changes what gets saved. It never blocks a save, and
 * the cataloger may know better than the ontology.
 */
function TeachingNote({ row, misplaced }: { row: Row; misplaced: Misplaced }) {
  const { doc, record } = useDescription()
  const { moveTo } = misplaced
  return (
    <OntologyNote field={row.label} domain={misplaced.domain} not={row.resource}>
      {moveTo && (
        <button
          type="button"
          className="secondary"
          onClick={() =>
            record(
              change(
                `Moved ${row.label} to the ${moveTo.resource}`,
                moveOps(doc, row.node, row.prop, row.values, moveTo.node),
              ),
            )
          }
        >
          Move to {moveTo.resource}
        </button>
      )}
    </OntologyNote>
  )
}

/** "BIBFRAME puts dimensions on the Instance, not the Work. Why?", and anything to do about it. */
function OntologyNote({
  field,
  domain,
  not,
  children,
}: {
  field: string
  domain: string
  /** Where the field is instead, when that's worth saying. */
  not?: string
  children?: ReactNode
}) {
  return (
    <p className="teaching-note">
      BIBFRAME puts {field.toLowerCase()} on {article(termLabel(domain))}
      {not && `, not the ${not}`}.{' '}
      <a href={primerUrl} target="_blank" rel="noreferrer">
        Why?
      </a>
      {children}
    </p>
  )
}

/** "the Instance" and "the Work" for the two resources, "a Title" for anything else. */
function article(cls: string): string {
  if (cls === 'Instance' || cls === 'Work') return `the ${cls}`
  return /^[AEIOU]/.test(cls) ? `an ${cls}` : `a ${cls}`
}

function MarcTag({ marc }: { marc: string }) {
  const links = marcLinks(marc)
  // "264 _1" links its tag and keeps the indicators beside it.
  const rest = marc.replace(/^\d{3}/, '')
  return (
    <span className="marc">
      {links.map(({ tag, href }, i) => (
        <span key={tag}>
          {i > 0 && '/'}
          <a href={href} target="_blank" rel="noreferrer" title={`MARC ${tag} in the MARC 21 bibliographic format`}>
            {tag}
          </a>
        </span>
      ))}
      {links.length === 1 && rest}
    </span>
  )
}

/** With hints on, where the BIBFRAME Primer explains what a section holds. */
function PrimerLinks({ title }: { title: string }) {
  const { hints } = useDescription()
  const pages = sectionPrimer[title]
  if (!hints || !pages) return null
  return (
    <span className="primer">
      {pages.map((page, i) => (
        <span key={page.path}>
          {i > 0 && ', '}
          <a href={primerPage(page.path)} target="_blank" rel="noreferrer" title={`${page.label} in the BIBFRAME Primer`}>
            {i === 0 ? `Primer: ${page.label}` : page.label}
          </a>
        </span>
      ))}
    </span>
  )
}

/** The property's name, "bf:extent", linking to its entry in the BIBFRAME ontology, with its definition on hover. */
function OntologyLink({ prop }: { prop: string }) {
  const entry = ontologyEntry(prop)
  if (!entry) return null
  return (
    <a className="ontology" href={entry.href} target="_blank" rel="noreferrer" title={entry.definition}>
      bf:{prop}
    </a>
  )
}

function Badge({ kind }: { kind: ResourceKind }) {
  return (
    <a
      className={`badge badge-${kind.toLowerCase()}`}
      href={resourcePrimer[kind]}
      target="_blank"
      rel="noreferrer"
      title={`Saved with the ${kind}. What's the difference? The BIBFRAME Primer explains.`}
    >
      {kind}
    </a>
  )
}

interface ValueProps {
  /** The node and property the value hangs on. */
  node: Key
  prop: string
  value: Value
  /** What the field is called, for labels and change descriptions. */
  label: string
}

function ValueView(props: ValueProps) {
  const { doc } = useDescription()
  const { value } = props
  if ('literal' in value) {
    const text = literalText(value.literal)
    // A bare string is a link where the schema says the property takes one
    // (Ref), text where it says Text; only where it says neither does the
    // string's own look decide.
    const kind = schemaKind(doc, props.node, props.prop)?.kind
    const link = kind ? kind !== 'text' : isUri(text)
    if (typeof value.literal === 'string' && link) return <Chip {...props} uri={text} />
    // Keyed by its text, so an undo that changes the value resets the field.
    return <LiteralField key={text} {...props} literal={value.literal} />
  }
  const node = getNode(doc, value.node)
  const id = node.keywords['@id']
  if (typeof id === 'string') return <Chip {...props} uri={id} />
  if (isComplexSubject(node)) return <ComplexSubject {...props} child={node} />
  const text = sourcesFor(props.prop).length > 0 ? unlinkedLabel(node) : undefined
  if (text) return <Unlinked {...props} child={node} text={text} />
  return <Subnode {...props} child={node} />
}

function useRemove({ node, prop, value, label }: ValueProps, name: string): () => void {
  const { record } = useDescription()
  return () => record(change(`Removed ${label}: ${name}`, [{ op: 'remove', node, prop, value: value.key }]))
}

function LiteralField(
  props: ValueProps & {
    literal: Literal
    /** Removes more than the literal, as when it stands for a node shown inline. */
    onRemove?: () => void
  },
) {
  const { record } = useDescription()
  const { node, prop, value, label, literal } = props
  const text = literalText(literal)
  const [draft, setDraft] = useState(text)
  const remove = useRemove(props, `“${text}”`)
  const scalar = isValueObject(literal) ? literal['@value'] : literal
  const language = isValueObject(literal) ? literal['@language'] : undefined
  const datatype = isValueObject(literal) ? literal['@type'] : undefined

  const commit = () => {
    if (draft === text) return
    const to = isValueObject(literal) ? { ...literal, '@value': draft } : draft
    record(change(`Changed ${label} to “${draft}”`, [{ op: 'set', node, prop, value: value.key, from: literal, to }]))
  }

  return (
    <span className="literal">
      <input
        aria-label={label}
        value={draft}
        readOnly={typeof scalar !== 'string'}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setDraft(text)
        }}
      />
      {language && (
        <span className="tag" title="Language of this text">
          {language}
        </span>
      )}
      {datatype && (
        <span className="tag" title={datatype}>
          {datatype.split(/[#/]/).pop()}
        </span>
      )}
      <RemoveButton name={label} onClick={props.onRemove ?? remove} />
    </span>
  )
}

/**
 * A linked value. One the context panel can tell more about opens it there;
 * any other opens where it links to.
 */
function Chip(props: ValueProps & { uri: string }) {
  const { labels, selected, select } = useDescription()
  const name = refName(props.uri, labels)
  const source = sourceOf(props.uri)
  const remove = useRemove(props, name)
  const isSelected = selected === props.uri
  return (
    <span className={isSelected ? 'chip selected' : 'chip'}>
      {hasContext(props.uri) ? (
        <button
          type="button"
          className="chip-name"
          aria-pressed={isSelected}
          title={`More about ${name}`}
          onClick={() => select(props.uri)}
        >
          {name}
        </button>
      ) : (
        <a href={props.uri} target="_blank" rel="noreferrer" title={props.uri}>
          {name}
        </a>
      )}
      {source && <span className="source">{source}</span>}
      <RemoveButton name={name} onClick={remove} />
    </span>
  )
}

/**
 * A complex subject, "Married women--California", as one row in its order.
 * Each part found in LC opens in the context panel like any linked value; a
 * part that isn't linked reads as text. Editing reopens it in the lookup, and
 * the whole subject is replaced as one change.
 */
function ComplexSubject(props: ValueProps & { child: Node }) {
  const { doc, labels, hints, record } = useDescription()
  const [editing, setEditing] = useState(false)
  const { node, prop, value, label, child } = props
  const components = componentsOf(doc, child, (uri) => refName(uri, labels))
  const heading = joinHeading(components)
  const remove = useRemove(props, heading)

  const replace = (json: Json, what: string) => {
    record(change(`Changed ${label}: ${what}`, replaceOps(doc, node, prop, value.key, json)))
    setEditing(false)
  }

  if (editing) {
    return (
      <Lookup
        label={label}
        sources={sourcesFor(prop)}
        already={new Set()}
        compose
        initial={components}
        onPick={(hit) => replace(hit.label ? { '@id': hit.uri, 'rdfs:label': [hit.label] } : { '@id': hit.uri }, hit.label || hit.uri)}
        onCompose={(parts) => replace(complexSubject(parts, denormalize(doc, child.key)), joinHeading(parts))}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <span className="chip complex">
      <span className="heading">
        {components.map((component, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="dashes">--</span>}
            <Part component={component} index={i} hints={hints} />
          </Fragment>
        ))}
      </span>
      {components.some((component) => component.uri) && <span className="source">LC</span>}
      <button type="button" className="link edit" aria-label={`Edit ${heading}`} onClick={() => setEditing(true)}>
        Edit
      </button>
      <RemoveButton name={heading} onClick={remove} />
    </span>
  )
}

/**
 * A value written as text where the field links to authorities: shown muted,
 * with the lookup it would have had a click away, already searching for the
 * text. Linking it is one change; the cataloger may also leave it, or open
 * its fields.
 */
function Unlinked(props: ValueProps & { child: Node; text: string }) {
  const { doc, labels, record } = useDescription()
  const [finding, setFinding] = useState(false)
  const [fields, setFields] = useState(false)
  const { node, prop, value, label, child, text } = props
  const remove = useRemove(props, text)
  const sources = sourcesFor(prop)
  const scheme = child.props.source?.flatMap((source) => {
    const id = 'node' in source ? getNode(doc, source.node).keywords['@id'] : undefined
    return typeof id === 'string' ? [refName(id, labels)] : []
  })[0]
  const uncontrolled = isUncontrolled(child)

  const replace = (json: Json, to: string) => {
    record(change(`Linked ${label}: ${text} to ${to}`, replaceOps(doc, node, prop, value.key, json)))
    setFinding(false)
  }

  if (finding) {
    return (
      <Lookup
        label={label}
        sources={sources}
        already={new Set()}
        compose={composes(prop)}
        initialText={text}
        onPick={(hit) => replace(linked(denormalize(doc, child.key), hit), hit.label || hit.uri)}
        onCompose={(parts) => replace(complexSubject(parts), joinHeading(parts))}
        onCancel={() => setFinding(false)}
      />
    )
  }

  return (
    <span className="unlinked-value">
      <span
        className="chip unlinked"
        title={`${uncontrolled ? 'Marked uncontrolled' : 'Not linked'}: written as text, so it isn’t the same ${label.toLowerCase()} as in other records`}
      >
        <span className="part unlinked">{text}</span>
        {scheme && <span className="source">{scheme}</span>}
        <span className="unlinked-note">{uncontrolled ? 'uncontrolled' : 'not linked'}</span>
        <button type="button" className="link" onClick={() => setFinding(true)}>
          Find authority
        </button>
        <button type="button" className="link" aria-expanded={fields} onClick={() => setFields(!fields)}>
          Fields
        </button>
        <RemoveButton name={text} onClick={remove} />
      </span>
      {fields && <Subnode {...props} child={child} />}
    </span>
  )
}

/** One part of a complex subject: linked, or text, with its subfield beside it when hints are on. */
function Part({ component, index, hints }: { component: Component; index: number; hints: boolean }) {
  const { selected, select } = useDescription()
  const { uri, label } = component
  const code = hints && <span className="code">${subfield(component, index)}</span>
  if (!uri) {
    return (
      <span className="part unlinked" title="Not linked to an LC authority">
        {code}
        {label}
      </span>
    )
  }
  if (!hasContext(uri)) {
    return (
      <a className="part" href={uri} target="_blank" rel="noreferrer" title={uri}>
        {code}
        {label}
      </a>
    )
  }
  return (
    <button
      type="button"
      className={selected === uri ? 'part chip-name selected' : 'part chip-name'}
      aria-pressed={selected === uri}
      title={`More about ${label}`}
      onClick={() => select(uri)}
    >
      {code}
      {label}
    </button>
  )
}

/**
 * Subforms that don't offer their empty fields. Admin metadata is
 * record-keeping, not cataloging. A Work, Instance or Hub described inside
 * another, such as the unnamed Work at the other end of a Relation, is a
 * resource of its own: offering all of a Work's fields there buries the
 * record it sits in.
 */
const noEmptyFields = new Set(['AdminMetadata', 'Work', 'Instance', 'Hub'])

/** A node described in place, such as a Title or an Extent: its own small form. */
function Subnode(props: ValueProps & { child: Node }) {
  const { doc } = useDescription()
  const { child, label } = props
  const typeLabels = typesOf(child).map(termLabel)
  const remove = useRemove(props, typeLabels.join(', ') || label)
  // The type is worth showing only where the row's label doesn't already say it.
  const caption = typeLabels.filter((type) => type !== label && type !== 'Contribution').join(', ')
  const list = child.keywords['@list']

  // A node that only carries a label, as an Extent does, reads as a plain field.
  const [onlyProp, ...otherProps] = Object.keys(child.props)
  const labelValue = child.props['rdfs:label']?.[0]
  if (
    !caption &&
    list === undefined &&
    onlyProp === 'rdfs:label' &&
    otherProps.length === 0 &&
    child.props['rdfs:label']?.length === 1 &&
    labelValue &&
    'literal' in labelValue
  ) {
    return (
      <LiteralField
        key={literalText(labelValue.literal)}
        node={child.key}
        prop="rdfs:label"
        value={labelValue}
        label={label}
        literal={labelValue.literal}
        onRemove={remove}
      />
    )
  }

  return (
    <div className="subnode">
      <div className="subnode-head">
        {caption && <span className="caption">{caption}</span>}
        {isEmpty(doc, child.key) && <span className="empty-note">Empty, so it won&rsquo;t be saved</span>}
        <RemoveButton name={label} onClick={remove} />
      </div>
      {Object.entries(child.props).map(([prop, values]) => {
        const domain = domainOf(prop)
        return (
          <div className="subfield" key={prop}>
            <span className="subfield-label">{termLabel(prop)}</span>
            <div className="row-values">
              {values.map((value) => (
                <ValueView key={value.key} node={child.key} prop={prop} value={value} label={termLabel(prop)} />
              ))}
              {domain && typesOf(child).length > 0 && !belongsOn(prop, typesOf(child)) && (
                <OntologyNote field={termLabel(prop)} domain={domain} />
              )}
            </div>
          </div>
        )
      })}
      {Array.isArray(list) && <ListItems items={list as Json[]} />}
      <EmptyFields doc={doc} child={child} owner={label} />
    </div>
  )
}

/**
 * The fields a subform's definition models that it doesn't have yet, so a new
 * Title offers Main title and Subtitle to fill in. Text fields are open,
 * ready to type into; links and nodes are an "Add" away.
 */
function EmptyFields({ doc, child, owner }: { doc: Doc; child: Node; owner: string }) {
  const definition = definitionOf(typesOf(child))
  if (!definition || noEmptyFields.has(definition)) return null
  return modeledProperties(definition)
    .filter((prop) => !child.props[prop])
    .map((prop) => {
      const label = termLabel(prop)
      const text = entryFor(fieldKind(doc, child.key, prop)).entry === 'text'
      return (
        <div className="subfield empty" key={prop}>
          <span className="subfield-label">{label}</span>
          <div className="row-values">
            <AddValue
              node={child.key}
              prop={prop}
              label={label}
              changeLabel={`${owner} ${label.toLowerCase()}`}
              prompt={`Add ${label.toLowerCase()}`}
              open={text}
            />
          </div>
        </div>
      )
    })
}

/**
 * An RDF list, such as a complex subject's components. Shown as it is; editing
 * list items is for later, and the normalized model keeps them verbatim.
 */
function ListItems({ items }: { items: Json[] }) {
  const { labels } = useDescription()
  const item = (json: Json): ReactNode => {
    if (typeof json === 'string') return isUri(json) ? refName(json, labels) : json
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      if (typeof json['@id'] === 'string') return refName(json['@id'], labels)
      const label = Object.entries(json).find(([name]) => /label$/i.test(name))?.[1]
      const first: unknown = Array.isArray(label) ? label[0] : label
      if (typeof first === 'string') return first
    }
    return JSON.stringify(json)
  }
  return (
    <ol className="list">
      {items.map((json, i) => (
        <li key={i}>{item(json)}</li>
      ))}
    </ol>
  )
}

function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" className="remove" aria-label={`Remove ${name}`} title={`Remove ${name}`} onClick={onClick}>
      ×
    </button>
  )
}
