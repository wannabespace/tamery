import { machines, machinesSelectSchema } from '@tamery/db/schema'

import { createSyncOutputSchema, createUserScopedSync } from '~/orpc/lib/sync'

export const sync = createUserScopedSync(
  machines,
  createSyncOutputSchema(machinesSelectSchema).array()
)
