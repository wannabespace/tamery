import { type } from 'arktype'
import { createWebStorageValue } from 'seitu/web'

import type { TableRef } from './diagram'

type DraftPlace = 'table' | 'visualizer'

const key = (
  resourceId: string,
  where: DraftPlace,
  { schema, table }: TableRef
) => `${resourceId}/${where}/${schema}.${table}`

const value = createWebStorageValue({
  defaultValue: [],
  key: 'saved-drafts',
  schema: type('string[]'),
  type: 'sessionStorage',
})

/** The tables whose drafts the user saved, by where they waited. Session storage outlives the reload that drops the drafts themselves, so a chat's draft card tells a saved draft from a lost one. */
export const savedDrafts = {
  forget: (resourceId: string, where: DraftPlace, ref: TableRef) => {
    const forgotten = key(resourceId, where, ref)
    value.set((keys) => keys.filter((saved) => saved !== forgotten))
  },
  key,
  mark: (resourceId: string, where: DraftPlace, refs: TableRef[]) =>
    value.set((keys) => [
      ...new Set([...keys, ...refs.map((ref) => key(resourceId, where, ref))]),
    ]),
  value,
}
