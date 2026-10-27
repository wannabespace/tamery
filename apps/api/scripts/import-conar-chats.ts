import type { AppMessagePart, AppUIMessage } from '@tamery/ai/message'
import { db } from '@tamery/db'
import { env } from '@tamery/db/env'
import { chats, chatsMessages, chatsMessagesParts } from '@tamery/db/schema'
import { resolveKeyring } from '@tamery/db/utils'
import { sql } from 'drizzle-orm'

// Chat v2 runs without tools: replaying Conar's tool calls makes the provider reject the request.
const IMPORTED_PART_TYPES = new Set<AppMessagePart['type']>([
  'reasoning',
  'text',
])

const { rows: conarChats } = await db.execute<{
  connection_resource_id: string
  created_at: Date
  id: string
  title: string | null
  user_id: string
}>(
  sql`SELECT id, created_at, user_id, connection_resource_id, title FROM conar_chats`
)

const { rows: conarMessages } = await db.execute<{
  chat_id: string
  created_at: Date
  id: string
  parts: string[]
  role: AppUIMessage['role']
}>(sql`SELECT id, created_at, chat_id, parts, role FROM conar_chats_messages`)

const keyring = resolveKeyring(env.ENCRYPTION_SECRET)

const messagesByChat = Object.groupBy(
  conarMessages.flatMap((message) => {
    const parts = message.parts
      .map((encryptedText): AppMessagePart =>
        JSON.parse(keyring.decrypt(encryptedText))
      )
      .filter((part) => IMPORTED_PART_TYPES.has(part.type))

    return parts.length > 0 ? { ...message, parts } : []
  }),
  (message) => message.chat_id
)

const importedCounts = await Promise.all(
  conarChats.map((chat) =>
    db.transaction(async (tx) => {
      const messages = messagesByChat[chat.id]

      if (!messages) {
        return 0
      }

      await tx
        .insert(chats)
        .values({
          connectionResourceId: chat.connection_resource_id,
          createdAt: chat.created_at,
          id: chat.id,
          title: chat.title,
          userId: chat.user_id,
        })
        .onConflictDoNothing()

      const inserted = await tx
        .insert(chatsMessages)
        .values(
          messages.map((message) => ({
            chatId: message.chat_id,
            createdAt: message.created_at,
            id: message.id,
            role: message.role,
          }))
        )
        .onConflictDoNothing()
        .returning({ id: chatsMessages.id })
      const insertedIds = new Set(inserted.map(({ id }) => id))
      const newMessages = messages.filter(({ id }) => insertedIds.has(id))

      if (newMessages.length > 0) {
        await tx.insert(chatsMessagesParts).values(
          newMessages.flatMap((message) =>
            message.parts.map((part, order) => ({
              messageId: message.id,
              order,
              part,
            }))
          )
        )
      }

      return newMessages.length
    })
  )
)

console.log(
  `Imported ${importedCounts.reduce((sum, count) => sum + count, 0)} messages from ${conarChats.length} Conar chats`
)
await db.$client.end()
