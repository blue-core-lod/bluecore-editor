import vocabularies from './vocabularies.json'
import type { Hit } from './qa'

export type Vocabulary = keyof typeof vocabularies

/** A list this short is shown whole before anything is typed, as a picklist. */
const shortList = 60

/**
 * Search a vendored LC vocabulary: the MARC code first ("aut", "eng"), then
 * labels that start with the text, then labels with a word that does, then
 * any that contain it. Nothing typed gives the whole of a short list.
 */
export function searchVocabulary(name: Vocabulary, query: string, limit = 20): Hit[] {
  const terms = vocabularies[name]
  const text = query.trim().toLowerCase()
  if (!text) return terms.length <= shortList ? terms : []
  const scored = terms.flatMap((term) => {
    const label = term.label.toLowerCase()
    const score =
      term.code.toLowerCase() === text
        ? 0
        : label.startsWith(text)
          ? 1
          : label.split(/[\s,(-]+/).some((word) => word.startsWith(text))
            ? 2
            : label.includes(text)
              ? 3
              : null
    return score === null ? [] : [{ term, score }]
  })
  return scored
    .sort((a, b) => a.score - b.score || a.term.label.localeCompare(b.term.label, 'en'))
    .slice(0, limit)
    .map(({ term }) => term)
}

/** A term's label by its URI, such as "author" for relators/aut. */
export function vocabularyLabel(name: Vocabulary, uri: string): string | undefined {
  return vocabularies[name].find((term) => term.uri === uri)?.label
}
