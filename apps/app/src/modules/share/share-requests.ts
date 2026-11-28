import { createStore } from 'seitu'

/** The table whose share dialog should open once its toolbar mounts (`resourceId:schema:table`): an agent asks for it from outside the table. */
export const shareRequests = createStore<string | null>(null)

export const getShareRequestKey = (
  resourceId: string,
  schema: string,
  table: string
) => `${resourceId}:${schema}:${table}`
