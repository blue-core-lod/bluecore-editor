import type { MouseEvent } from 'react'

import { kinds, type Tier } from '../schema/guidance'
import { Header } from './Header'
import { percent, profileOf, propertyName, type Definition, type Profile, type ProfileField } from './profile'
import { fieldsHref, openFields } from './route'

/** The full rules, in prose, for anyone who wants more than this page says. */
const rulesUrl = 'https://github.com/blue-core-lod/bluecore-editor/blob/main/docs/which-fields.md'

/**
 * Which fields a kind of record offers, and why: the profile the editor works
 * from, shown from the same code, so it is always the running build's. Open
 * without signing in, so it can be shared.
 */
export function Fields({ kind }: { kind: string }) {
  const profile = kind ? profileOf(kind) : undefined
  return (
    <>
      <Header />
      <main className="page fields">
        <KindNav current={profile?.kind.id} />
        {profile ? (
          <ProfileView profile={profile} />
        ) : (
          <>
            <h1>Fields by kind of record</h1>
            {kind && <p className="note">There’s no kind of record called “{kind}”.</p>}
            <p>
              The editor has no templates. For each kind of record, it offers first the fields most of LC’s records of
              that kind have, with a few corrections made by hand. Choose a kind to see its fields, and why each is
              offered. <a href={rulesUrl}>How fields are chosen</a> explains the rules.
            </p>
          </>
        )}
      </main>
    </>
  )
}

function KindNav({ current }: { current?: string }) {
  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    openFields(id)
  }
  return (
    <nav className="kind-nav" aria-label="Kinds of record">
      {kinds.map((kind) => (
        <a
          key={kind.id}
          href={fieldsHref(kind.id)}
          aria-current={kind.id === current ? 'page' : undefined}
          onClick={(event) => go(event, kind.id)}
        >
          {kind.label}
        </a>
      ))}
    </nav>
  )
}

function ProfileView({ profile }: { profile: Profile }) {
  const { kind, thresholds } = profile
  const name = kind.label.toLowerCase()
  return (
    <>
      <h1>Fields for {kind.plural}</h1>
      <p>
        Measured on a sample of LC’s {kind.plural}. A field is <strong>shown</strong> when{' '}
        {percent(thresholds.shown)} or more of them have it, and <strong>suggested</strong> at{' '}
        {percent(thresholds.suggested)} to {percent(thresholds.shown)}, unless an override says otherwise. A record
        already in Blue Core also shows every value it has, whatever its tier. A field marked “close to the line” is
        near enough to a threshold that another sample could put it in the next tier, so it’s worth deciding with an
        override. <a href={rulesUrl}>How fields are chosen</a>
      </p>

      <h2>Defined by</h2>
      <p>
        A record is {article(name)} {name} when <Defining definition={profile.definedBy} />
        {profile.definedBy.afterOthers && ', and no kind before it in the list above matches first'}.{' '}
        {profile.startsAs ? 'A new record starts as one: ' : `Once you choose ${name}, a new record holds: `}
        {profile.holds.map((held, i) => (
          <span key={`${held.resource} ${held.what} ${held.value}`}>
            {i > 0 && ', '}
            {held.resource} {held.what === 'type' ? 'type' : <code>{propertyName(held.what)}</code>}{' '}
            <code>{held.value}</code>
          </span>
        ))}
        .
      </p>

      <h2>Overrides</h2>
      {profile.overrides.length === 0 ? (
        <p>None: every tier here comes from the measured share.</p>
      ) : (
        <>
          <p>Tiers set by hand, whatever their share among LC’s {kind.plural}.</p>
          <table className="fields-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Share</th>
                <th>Measured tier</th>
                <th>Set to</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {profile.overrides.map((override) => (
                <tr key={override.prop}>
                  <td>
                    <code>{propertyName(override.prop)}</code>
                  </td>
                  <td className="share">{percent(override.share)}</td>
                  <td>{tierName(override.measured)}</td>
                  <td>{tierName(override.tier)}</td>
                  <td>{override.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {profile.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <table className="fields-table by-field">
            <thead>
              <tr>
                <th>Field</th>
                <th>Property</th>
                <th>On</th>
                <th>MARC</th>
                <th>Share</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {section.fields.map((field) => (
                <FieldRow key={`${field.resource} ${field.prop}`} field={field} />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {profile.available.length > 0 && (
        <>
          <h2>Available through Add field</h2>
          <p>
            Properties some of LC’s {kind.plural} have that the sections don’t offer: under{' '}
            {percent(thresholds.suggested)} of them, or moved here by an override. Add field offers these and every
            other BIBFRAME property, with their shares.
          </p>
          <p className="fields-available">
            {profile.available.map(({ prop, share, override }, i) => (
              <span key={prop}>
                {i > 0 && ', '}
                <code>{propertyName(prop)}</code> {percent(share)}
                {override && ' (override)'}
              </span>
            ))}
          </p>
        </>
      )}

      <h2>Never offered</h2>
      <p>
        Record-keeping and structure, whatever their share:{' '}
        {profile.never.map((prop, i) => (
          <span key={prop}>
            {i > 0 && ', '}
            <code>{propertyName(prop)}</code>
          </span>
        ))}
        .
      </p>
    </>
  )
}

function FieldRow({ field }: { field: ProfileField }) {
  const notes = [
    field.setByKind && 'set by the kind',
    field.override && 'override',
    field.nearThreshold && !field.override && 'close to the line',
  ].filter(Boolean)
  return (
    <tr>
      <td>{field.label}</td>
      <td>
        <code>{propertyName(field.prop)}</code>
        {field.typed.length > 0 && (
          <span className="typed">
            {field.typed.map(({ cls, share }) => `${cls} ${percent(share)}`).join(', ')}
          </span>
        )}
      </td>
      <td>{field.resource}</td>
      <td>{field.marc}</td>
      <td className="share">{percent(field.share)}</td>
      <td title={field.override?.reason}>
        {tierName(field.tier)}
        {notes.length > 0 && <span className="muted"> ({notes.join(', ')})</span>}
      </td>
    </tr>
  )
}

function Defining({ definition }: { definition: Definition }) {
  return (
    <>
      its Work’s type is <Either codes={definition.work} />
      {definition.issuance.length > 0 && (
        <>
          , or its issuance (<code>bf:issuance</code>) is <Either codes={definition.issuance} />
        </>
      )}
      {definition.online && (
        <>
          , and its only carrier (<code>bf:carrier</code>) is <code>cr</code> (online resource)
        </>
      )}
    </>
  )
}

function Either({ codes }: { codes: string[] }) {
  return (
    <>
      {codes.map((code, i) => (
        <span key={code}>
          {i > 0 && ' or '}
          <code>{code}</code>
        </span>
      ))}
    </>
  )
}

function tierName(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}
