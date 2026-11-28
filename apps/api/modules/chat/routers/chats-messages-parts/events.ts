import { chatsMessagesPartsSelectSchema } from '@tamery/db/schema'

import {
  createEventsEndpoint,
  createSyncOutputSchema,
  createSyncPublisher,
} from '~/orpc/lib/sync'

const output = createSyncOutputSchema(chatsMessagesPartsSelectSchema)

export const publisher = createSyncPublisher(
  output,
  'orpc:publisher:chats-messages-parts:'
)
export const events = createEventsEndpoint(output, publisher)
