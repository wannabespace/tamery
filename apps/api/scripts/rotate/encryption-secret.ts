import { env } from '@tamery/db/env'
import {
  chatsMessages,
  chatsMessagesParts,
  connections,
  queries,
  shares,
} from '@tamery/db/schema'

import { runColumnKeyRotation } from './column-key'

// ENCRYPTION_SECRET is the at-rest key for every encryptedText/encryptedJson column.
await runColumnKeyRotation({
  columns: [
    { cipher: connections.connectionString, id: connections.id },
    { cipher: queries.query, id: queries.id },
    { cipher: chatsMessages.metadata, id: chatsMessages.id },
    { cipher: chatsMessagesParts.part, id: chatsMessagesParts.id },
    { cipher: shares.view, id: shares.id },
  ],
  secretName: 'ENCRYPTION_SECRET',
  secrets: env.ENCRYPTION_SECRET,
})
