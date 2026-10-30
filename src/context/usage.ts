import { usageUrl } from '../api/endpoints'

/** Where Blue Core uses an entity, as its usage endpoint says. */
export interface Usage {
  works: number
  /** Instances that use it, themselves or through their Work: the records it's in. */
  records: number
  /** What the Works use it as, by property, such as { contribution: 398, subject: 3 }. */
  usedAs: Record<string, number>
  /** Contribution roles, by relator URI. */
  roles: Record<string, number>
  recentWorks: { uri: string; title: string; instances: number }[]
}

/** Blue Core's usage is public, like its search, so no token is sent. */
export async function fetchUsage(uri: string, signal?: AbortSignal): Promise<Usage> {
  const response = await fetch(usageUrl(uri), { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Blue Core returned ${response.status}`)
  const json = (await response.json()) as {
    works?: number
    records?: number
    used_as?: Record<string, number>
    roles?: Record<string, number>
    recent_works?: { uri: string; title: string; instances: number }[]
  }
  return {
    works: json.works ?? 0,
    records: json.records ?? 0,
    usedAs: json.used_as ?? {},
    roles: json.roles ?? {},
    recentWorks: json.recent_works ?? [],
  }
}

/**
 * The Works this entity is on whose title is the record's, apart from the
 * record's own Work: likely the same work, already in Blue Core.
 */
export function matchingWorks(usage: Usage, title: string, ownWork?: string): Usage['recentWorks'] {
  const want = comparable(title)
  if (!want) return []
  return usage.recentWorks.filter((work) => work.uri !== ownWork && comparable(work.title) === want)
}

/** A title for comparing: no case, accents, punctuation, leading article, or what follows " : " or " / ". */
function comparable(title: string): string {
  return (title.split(/\s[:/]\s/)[0] ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}
