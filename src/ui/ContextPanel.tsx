import { useState, type ReactNode } from 'react'

import { disagreements } from '../context/disagreements'
import { fetchLcAuthority, lcAuthorityId, type Citation, type LcAuthority } from '../context/lc'
import { useSource, type Fetched } from '../context/useSource'
import { fetchWikidata, type WikidataFacts } from '../context/wikidata'
import { fetchWikipedia } from '../context/wikipedia'

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
  hints,
  close,
}: {
  uri: string
  name: string
  /** A lookup result, not yet in the record. */
  previewing?: boolean
  hints: boolean
  close: () => void
}) {
  const lccn = lcAuthorityId(uri)?.id
  const lc = useSource('lc', uri, fetchLcAuthority) ?? loading
  const wikidata = useSource('wikidata', lccn, fetchWikidata)
  const wikidataFacts = wikidata?.state === 'done' ? wikidata.value : null
  const wikipedia = useSource('wikipedia', wikidataFacts?.wikipedia, fetchWikipedia)

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

      {conflicts.map((conflict) => (
        <p key={conflict} className="context-disagreement">
          {conflict}
        </p>
      ))}

      <SourceSection title={authority?.kind ?? 'LC authority'} fetched={lc} missing="id.loc.gov doesn’t have this record.">
        {(record) => <LcRecord record={record} hints={hints} />}
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
