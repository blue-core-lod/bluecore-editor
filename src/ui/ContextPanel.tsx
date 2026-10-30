import { useState, type ReactNode } from 'react'

import { disagreements } from '../context/disagreements'
import { fetchLcAuthority, lcAuthorityId, type Citation, type LcAuthority } from '../context/lc'
import { fetchUsage, matchingWorks, type Usage } from '../context/usage'
import { useSource, type Fetched } from '../context/useSource'
import { fetchWikidata, type WikidataFacts } from '../context/wikidata'
import { fetchWikipedia } from '../context/wikipedia'
import { vocabularyLabel } from '../lookup/local'
import { termLabel } from './labels'

/**
 * What the sources say about the linked entity the cataloger is looking at:
 * the evidence for choosing it, brought beside the record (design.md, The
 * context panel). Each source appears as it answers. It reads, and never
 * changes the record.
 */
export function ContextPanel({
  uri,
  name,
  previewing = false,
  record,
  hints,
  close,
}: {
  uri: string
  name: string
  /** A lookup result, not yet in the record. */
  previewing?: boolean
  /** The record being edited: its title, and its Work's URI. */
  record: { title: string; work?: string }
  hints: boolean
  close: () => void
}) {
  const lccn = lcAuthorityId(uri)?.id
  const lc = useSource('lc', uri, fetchLcAuthority) ?? loading
  const wikidata = useSource('wikidata', lccn, fetchWikidata)
  const wikidataFacts = wikidata?.state === 'done' ? wikidata.value : null
  const wikipedia = useSource('wikipedia', wikidataFacts?.wikipedia, fetchWikipedia)
  const usage = useSource('usage', uri, fetchUsage) ?? loading
  const usageFacts = usage.state === 'done' ? usage.value : null
  const matches = usageFacts && usageFacts.usedAs.contribution ? matchingWorks(usageFacts, record.title, record.work) : []

  const authority = lc.state === 'done' ? lc.value : null
  const conflicts = authority && wikidataFacts ? disagreements(authority, wikidataFacts) : []

  return (
    <aside className="context-panel" aria-label="Context">
      <header className="context-header">
        <div>
          {previewing && <p className="context-previewing">Search result, not in the record yet</p>}
          <h2>{authority?.label ?? name}</h2>
          {wikidataFacts?.description && <p className="muted">{wikidataFacts.description}</p>}
        </div>
        <button type="button" className="secondary" aria-label="Close context panel" onClick={close}>
          ×
        </button>
      </header>

      {usageFacts && matches.length > 0 && <WorkSuggestion usage={usageFacts} matches={matches} />}

      {conflicts.map((conflict) => (
        <p key={conflict} className="context-disagreement">
          {conflict}
        </p>
      ))}

      <SourceSection title={authority?.kind ?? 'LC authority'} fetched={lc} missing="id.loc.gov doesn’t have this record.">
        {(record) => <LcRecord record={record} hints={hints} />}
      </SourceSection>

      <SourceSection title="In Blue Core" fetched={usage} missing="">
        {(facts) => <UsageView usage={facts} />}
      </SourceSection>

      {wikidata && (
        <SourceSection title="Wikidata" fetched={wikidata} missing="No Wikidata item gives this LC identifier.">
          {(facts) => <WikidataCard facts={facts} />}
        </SourceSection>
      )}

      {wikipedia && (
        <SourceSection title="Wikipedia" fetched={wikipedia} missing="No English Wikipedia article.">
          {(lead) => (
            <>
              <p className="context-lead">{lead.extract}</p>
              <p className="context-credit">
                From <a href={lead.url} target="_blank" rel="noreferrer">Wikipedia</a>, CC BY-SA
              </p>
            </>
          )}
        </SourceSection>
      )}
    </aside>
  )
}

const loading: Fetched<never> = { state: 'loading' }

/** A source's part of the panel, in whichever state it's in, so a missing answer is never mistaken for "nothing to say". */
function SourceSection<T>({
  title,
  fetched,
  missing,
  children,
}: {
  title: string
  fetched: Fetched<T | null>
  missing: string
  children: (value: T) => ReactNode
}) {
  return (
    <section className="context-section" aria-busy={fetched.state === 'loading'}>
      <h3>{title}</h3>
      {fetched.state === 'loading' && <p className="muted">Asking…</p>}
      {fetched.state === 'failed' && <p className="muted">Couldn’t reach it: {fetched.error}</p>}
      {fetched.state === 'done' && (fetched.value === null ? <p className="muted">{missing}</p> : children(fetched.value))}
    </section>
  )
}

function LcRecord({ record, hints }: { record: LcAuthority; hints: boolean }) {
  return (
    <>
      <p className="context-id">
        <a href={record.uri.replace(/^http:/, 'https:')} target="_blank" rel="noreferrer">
          {record.id}
        </a>
        {hints && record.marcKey && <span className="context-marc">{record.marcKey}</span>}
      </p>
      {(record.born || record.died) && (
        <Facts
          rows={[
            ['Born', [record.born, record.birthplaces.join('; ')].filter(Boolean).join(', ')],
            ['Died', record.died],
            ['Occupation', record.occupations.join(', ')],
            ['Field', record.fields.join(', ')],
          ]}
        />
      )}
      <Listing title="Variant forms" marc="4XX" hints={hints} items={record.variants} />
      <Listing title="See also" marc="5XX" hints={hints} items={record.sees} />
      <Listing title="Broader terms" marc="550" hints={hints} items={record.broader} />
      <Listing title="Narrower terms" marc="550" hints={hints} items={record.narrower} />
      <Listing
        title="Found in"
        marc="670"
        hints={hints}
        items={record.sources}
        render={(citation) => <CitationView citation={citation} />}
      />
      <Listing
        title="Notes"
        marc={record.kind === 'LC name authority' ? undefined : '680'}
        hints={hints}
        items={record.notes}
      />
    </>
  )
}

const shown = 3

/** A list that shows a few and keeps the rest a click away: Twain has 31 variant forms. */
function Listing<T>({
  title,
  marc,
  hints,
  items,
  render = (item) => String(item),
}: {
  title: string
  marc?: string
  hints: boolean
  items: T[]
  render?: (item: T) => ReactNode
}) {
  const [all, setAll] = useState(false)
  if (items.length === 0) return null
  const visible = all ? items : items.slice(0, shown)
  return (
    <div className="context-list">
      <h4>
        {title}
        {hints && marc && <span className="context-marc">{marc}</span>}
      </h4>
      <ul>
        {visible.map((item, index) => (
          <li key={index}>{render(item)}</li>
        ))}
      </ul>
      {items.length > shown && (
        <button type="button" className="link" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `and ${items.length - shown} more`}
        </button>
      )}
    </div>
  )
}

function CitationView({ citation }: { citation: Citation }) {
  const title = citation.url ? (
    <a href={citation.url} target="_blank" rel="noreferrer">
      {citation.title}
    </a>
  ) : (
    citation.title
  )
  return (
    <>
      <cite>{title}</cite>
      {citation.found && <span className="muted"> ({citation.found})</span>}
    </>
  )
}

function WikidataCard({ facts }: { facts: WikidataFacts }) {
  return (
    <div className="context-wikidata">
      {facts.image && <img src={facts.image} alt="" width={72} loading="lazy" />}
      <div>
        <Facts
          rows={[
            ['Born', [facts.born, facts.birthplace].filter(Boolean).join(', ')],
            ['Died', [facts.died, facts.deathplace].filter(Boolean).join(', ')],
            ['Occupation', facts.occupations.join(', ')],
            ['Pen names', facts.pseudonyms.join('; ')],
          ]}
        />
        <p className="context-id">
          <a href={facts.uri} target="_blank" rel="noreferrer">
            {facts.id}
          </a>
        </p>
      </div>
    </div>
  )
}

function Facts({ rows }: { rows: [string, string | undefined][] }) {
  const filled = rows.filter((row): row is [string, string] => Boolean(row[1]))
  if (filled.length === 0) return null
  return (
    <dl className="context-facts">
      {filled.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A Work already in Blue Core with this record's title and this contributor:
 * likely the work being cataloged (design.md, Suggestions). Shown for the
 * cataloger to look at; attaching the record to it is still to come.
 */
function WorkSuggestion({ usage, matches }: { usage: Usage; matches: Usage['recentWorks'] }) {
  const [first] = matches
  if (!first) return null
  return (
    <div className="context-suggestion">
      <p className="context-suggestion-title">
        {usage.works === 1 ? 'This name is on 1 Work in Blue Core' : `This name is on ${usage.works} Works in Blue Core`}
      </p>
      <p>
        {usage.works === 1 ? 'That Work, ' : matches.length === 1 ? 'One of them, ' : `${matches.length} of them, including `}
        <a href={first.uri} target="_blank" rel="noreferrer">
          {first.title}
        </a>
        , has your record’s title
        {first.instances > 0 &&
          `, with ${first.instances === 1 ? '1 Instance' : `${first.instances} Instances`} already`}
        . It may be the work you’re cataloging.
      </p>
      <p className="context-credit">From Blue Core usage</p>
    </div>
  )
}

function UsageView({ usage }: { usage: Usage }) {
  if (usage.works === 0 && usage.records === 0) return <p className="muted">Not used in Blue Core yet.</p>
  const roles = Object.entries(usage.roles)
  const named = roles.slice(0, 3).map(([role, count]) => `${vocabularyLabel('relators', role) ?? role.split('/').pop()} in ${count}`)
  const others = roles.slice(3).reduce((sum, [, count]) => sum + count, 0)
  if (others > 0) named.push(`other roles in ${others}`)
  const uses = Object.entries(usage.usedAs).filter(([prop]) => prop !== 'contribution')
  return (
    <>
      <p>
        Used in {plural(usage.records, 'record')}
        {usage.works > 0 && <>, across {plural(usage.works, 'Work')}</>}
      </p>
      {named.length > 0 && <p>{capitalize(named.join(', '))}</p>}
      {uses.map(([prop, count]) => (
        <p key={prop}>
          {termLabel(prop)} in {plural(count, 'Work')}
        </p>
      ))}
      <Listing
        title="Recent Works"
        hints={false}
        items={usage.recentWorks}
        render={(work) => (
          <>
            <a href={work.uri} target="_blank" rel="noreferrer">
              {work.title}
            </a>
            <span className="muted"> {plural(work.instances, 'Instance')}</span>
          </>
        )}
      />
    </>
  )
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
