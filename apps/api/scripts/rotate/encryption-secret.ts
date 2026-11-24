import '@tamery/shared/arktype-config'
import { env } from '@tamery/db/env'
import {
  aiKeys,
  chats,
  chatsMessages,
  chatsMessagesParts,
  connections,
  queries,
  schemaNotes,
  shares,
} from '@tamery/db/schema'

import { runColumnKeyRotation } from './column-key'

// ENCRYPTION_SECRET is the at-rest key for every encryptedText/encryptedJson column.
await runColumnKeyRotation({
  columns: [
    { cipher: connections.connectionString, id: connections.id },
    { cipher: queries.query, id: queries.id },
    { cipher: schemaNotes.note, id: schemaNotes.id },
    { cipher: aiKeys.key, id: aiKeys.id },
    { cipher: chats.title, id: chats.id },
    { cipher: chats.compaction, id: chats.id },
    { cipher: chatsMessages.metadata, id: chatsMessages.id },
    { cipher: chatsMessagesParts.part, id: chatsMessagesParts.id },
    { cipher: shares.view, id: shares.id },
  ],
  secretName: 'ENCRYPTION_SECRET',
  secrets: env.ENCRYPTION_SECRET,
})
