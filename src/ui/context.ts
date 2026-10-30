import { createContext, useContext } from 'react'

import type { Change } from '../doc/log'
import type { Doc } from '../doc/model'
import type { RefLabel } from './labels'

/** What every part of the description view needs: the document, its labels, and how to record a change. */
export interface DescriptionContextValue {
  doc: Doc
  labels: Map<string, RefLabel>
  hints: boolean
  record: (change: Change) => void
  /** The linked entity the context panel is showing, if any. */
  selected: string | null
  /** Show an entity in the context panel. */
  select: (uri: string) => void
}

export const DescriptionContext = createContext<DescriptionContextValue | null>(null)

export function useDescription(): DescriptionContextValue {
  const context = useContext(DescriptionContext)
  if (!context) throw new Error('outside a Description')
  return context
}
