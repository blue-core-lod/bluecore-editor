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
  /** Show a lookup result in the context panel while it's highlighted, or stop. */
  preview: (entity: Previewed | null) => void
}

/** A lookup result shown in the context panel before it's chosen. */
export interface Previewed {
  uri: string
  label: string
}

export const DescriptionContext = createContext<DescriptionContextValue | null>(null)

export function useDescription(): DescriptionContextValue {
  const context = useContext(DescriptionContext)
  if (!context) throw new Error('outside a Description')
  return context
}
