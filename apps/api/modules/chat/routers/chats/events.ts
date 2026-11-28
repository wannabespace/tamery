import { chatsSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

const output = createSyncOutputSchema(chatsSelectSchema)

export const publisher = createSyncPublisher(output, 'orpc:publisher:chats:')
export const events = createEventsEndpoint(output, publisher)
