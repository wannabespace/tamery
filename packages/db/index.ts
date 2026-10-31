import { logDriverError } from '@tamery/shared/sanitize-log'
import { drizzle } from 'drizzle-orm/node-postgres'

import { env } from './env'
import { authRelations } from './schema/auth'
import { chatsRelations } from './schema/chats'
import { connectionsRelations } from './schema/connections'
import { queriesRelations } from './schema/queries'
import { sharesRelations } from './schema/shares'

export const relations = {
  ...authRelations,
  ...chatsRelations,
  ...connectionsRelations,
  ...queriesRelations,
  ...sharesRelations,
}

export const db = drizzle(env.DATABASE_URL, {
  relations,
})

// An idle client's network error is emitted on the pool; unhandled, it kills the process.
db.$client.on('error', logDriverError)
