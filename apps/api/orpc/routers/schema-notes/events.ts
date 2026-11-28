import { schemaNotesSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

const output = createSyncOutputSchema(schemaNotesSelectSchema)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:schema-notes:'
)
export const events = createEventsEndpoint(output, publisher)
