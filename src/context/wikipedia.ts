/** The lead of an English Wikipedia article, from its page summary, which allows any origin. */

export interface WikipediaLead {
  title: string
  extract: string
  url: string
}

export async function fetchWikipedia(title: string, signal?: AbortSignal): Promise<WikipediaLead | null> {
  const path = encodeURIComponent(title.replaceAll(' ', '_'))
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${path}`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`)
  const json = (await response.json()) as {
    title?: string
    extract?: string
    type?: string
    content_urls?: { desktop?: { page?: string } }
  }
  // A disambiguation page's lead says nothing about this entity.
  if (!json.extract || json.type === 'disambiguation') return null
  return {
    title: json.title ?? title,
    extract: json.extract,
    url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${path}`,
  }
}
