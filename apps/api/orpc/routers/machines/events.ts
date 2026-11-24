import { machinesSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

const output = createSyncOutputSchema(machinesSelectSchema)

export const publisher = createSyncPublisher(output, 'orpc:publisher:machines:')
export const events = createEventsEndpoint(output, publisher)
