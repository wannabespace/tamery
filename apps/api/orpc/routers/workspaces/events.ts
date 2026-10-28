import { workspacesSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

export const output = createSyncOutputSchema(
  workspacesSelectSchema.merge({ role: 'string' })
)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:workspaces:'
)
export const events = createEventsEndpoint(output, publisher)
