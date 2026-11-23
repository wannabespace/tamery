import {
  connectionMachines,
  connectionMachinesSelectSchema,
} from '@tamery/db/schema'

import { createSyncOutputSchema, createUserScopedSync } from '~/orpc/lib/sync'

export const sync = createUserScopedSync(
  connectionMachines,
  createSyncOutputSchema(connectionMachinesSelectSchema).array()
)
