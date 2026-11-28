import { schemaNotes, schemaNotesSelectSchema } from '@tamery/db/schema'

import { createSyncOutputSchema, createUserScopedSync } from '~/orpc/lib/sync'

export const sync = createUserScopedSync(
  schemaNotes,
  createSyncOutputSchema(schemaNotesSelectSchema).array()
)
