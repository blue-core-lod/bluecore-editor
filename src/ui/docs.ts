import { version } from './version'

/** Where the editor's source and docs are published: the one place to change if the repository moves. */
const repository = 'https://github.com/edsu/bluecore-editor'

/**
 * A doc in the repository as it was at the commit this build was made from,
 * so it describes the guidance the cataloger is looking at, not whatever is
 * on main by now. A dev build links to main.
 */
export function docsUrl(path: string): string {
  return `${repository}/blob/${version === 'dev' ? 'main' : version}/docs/${path}`
}

/** A kind of resource's field profile (docs/profiles), generated from the same guidance the editor uses. */
export function profileUrl(kind: string): string {
  return docsUrl(`profiles/${kind}.md`)
}

/** The rules for which fields the editor shows (docs/which-fields.md). */
export const whichFieldsUrl = docsUrl('which-fields.md')
