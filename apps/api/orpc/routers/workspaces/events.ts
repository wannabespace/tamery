import { workspacesSelectSchema } from '@tamery/db/schema'
import { workspaceRole } from '@tamery/shared/workspace'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

export const output = createSyncOutputSchema(
  workspacesSelectSchema.merge({ role: workspaceRole })
)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:workspaces:'
)
export const events = createEventsEndpoint(output, publisher)
