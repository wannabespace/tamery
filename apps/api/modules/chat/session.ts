import { ORPCError } from '@orpc/server'
import { db } from '@tamery/db'
import { chats, schemaNotes } from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { publisher as chatsPublisher } from '~/modules/chat/routers/chats/events'

export const chatSession = {
  connection: async (data: {
    connectionResourceId: string
    userId: string
  }) => {
    const resource = await db.query.connectionsResources.findFirst({
      columns: { name: true },
      where: {
        connection: { RAW: inMemberWorkspace(data.userId) },
        id: { eq: data.connectionResourceId },
      },
      with: { connection: { columns: { id: true, name: true, type: true } } },
    })
    if (!resource?.connection) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Connection resource not found',
      })
    }
    const notes = await db
      .select({
        column: schemaNotes.column,
        note: schemaNotes.note,
        schema: schemaNotes.schema,
        table: schemaNotes.table,
      })
      .from(schemaNotes)
      .where(
        and(
          eq(schemaNotes.connectionResourceId, data.connectionResourceId),
          eq(schemaNotes.userId, data.userId)
        )
      )
    return { ...resource.connection, notes, resource: resource.name }
  },
  ensureChat: async (data: {
    chatId: string
    connectionResourceId: string
    subagent?: { parentChatId: string; title: string }
    userId: string
  }) => {
    const connection = await chatSession.connection(data)

    const findOwnedChat = () =>
      db.query.chats.findFirst({
        columns: { parentChatId: true, title: true },
        where: {
          connectionResourceId: { eq: data.connectionResourceId },
          id: { eq: data.chatId },
          userId: { eq: data.userId },
        },
      })
    const existing = await findOwnedChat()

    if (!existing && data.subagent) {
      // A subagent hangs off a top-level chat of the same user and resource, never off another subagent.
      const parent = await db.query.chats.findFirst({
        columns: { connectionResourceId: true, parentChatId: true },
        where: {
          id: { eq: data.subagent.parentChatId },
          userId: { eq: data.userId },
        },
      })
      if (
        !parent ||
        parent.parentChatId ||
        parent.connectionResourceId !== data.connectionResourceId
      ) {
        throw new ORPCError('NOT_FOUND', { message: 'Chat not found' })
      }
    }

    const [inserted] = existing
      ? []
      : await db
          .insert(chats)
          .values({
            connectionResourceId: data.connectionResourceId,
            id: data.chatId,
            parentChatId: data.subagent?.parentChatId,
            title: data.subagent?.title,
            userId: data.userId,
          })
          .onConflictDoNothing()
          .returning()
    const chat = existing ?? inserted ?? (await findOwnedChat())
    if (!chat) {
      throw new ORPCError('NOT_FOUND', { message: 'Chat not found' })
    }

    if (inserted) {
      chatsPublisher.publish(data.userId, { type: 'insert', value: inserted })
    }
    return {
      connection,
      isSubagent: !!chat.parentChatId,
      title: chat.title,
    }
  },
}
