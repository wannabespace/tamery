import { connectionMachinesSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

const output = createSyncOutputSchema(connectionMachinesSelectSchema)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:connection-machines:'
)
export const events = createEventsEndpoint(output, publisher)
