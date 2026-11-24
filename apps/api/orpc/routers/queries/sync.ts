import { queries, queriesSelectSchema } from '@tamery/db/schema'

import { createSyncOutputSchema, createUserScopedSync } from '~/orpc/lib/sync'

export const sync = createUserScopedSync(
  queries,
  createSyncOutputSchema(queriesSelectSchema).array()
)
