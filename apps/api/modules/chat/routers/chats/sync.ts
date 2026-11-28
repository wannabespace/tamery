import { chats, chatsSelectSchema } from '@tamery/db/schema'

import { createSyncOutputSchema, createUserScopedSync } from '~/orpc/lib/sync'

export const sync = createUserScopedSync(
  chats,
  createSyncOutputSchema(chatsSelectSchema).array()
)
