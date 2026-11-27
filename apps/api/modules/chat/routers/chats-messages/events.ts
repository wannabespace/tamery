import { chatsMessagesSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

const output = createSyncOutputSchema(chatsMessagesSelectSchema)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:chats-messages:'
)
export const events = createEventsEndpoint(output, publisher)
