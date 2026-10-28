import { ORPCError } from '@orpc/server'
import { generateChatTitle } from '@tamery/ai/features'
import type { AppUIMessage } from '@tamery/ai/message'
import { messagesFromPartRows } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chats, chatsMessages, chatsMessagesParts } from '@tamery/db/schema'
import { silently } from '@tamery/shared/utils'
import { and, asc, eq, isNull } from 'drizzle-orm'

import { aiUsage } from '~/lib/ai-usage'
import { inMemberWorkspace } from '~/lib/workspace'
import { publisher as chatsMessagesPartsPublisher } from '~/orpc/routers/chats-messages-parts/events'
import { publisher as chatsMessagesPublisher } from '~/orpc/routers/chats-messages/events'
import { publisher as chatsPublisher } from '~/orpc/routers/chats/events'

export const chatPersist = {
  deleteMessage: async (data: {
    chatId: string
    messageId: string
    userId: string
  }) => {
    const [deleted] = await db
      .delete(chatsMessages)
      .where(
        and(
          eq(chatsMessages.id, data.messageId),
          eq(chatsMessages.chatId, data.chatId)
        )
      )
      .returning({ id: chatsMessages.id })

    if (deleted) {
      chatsMessagesPublisher.publish(data.userId, {
        key: deleted.id,
        type: 'delete',
      })
    }
  },
  ensureChat: async (data: {
    chatId: string
    connectionResourceId: string
    userId: string
  }) => {
    const existing = await db.query.chats.findFirst({
      columns: { title: true, userId: true },
      where: { id: { eq: data.chatId } },
    })

    if (existing) {
      if (existing.userId !== data.userId) {
        throw new ORPCError('NOT_FOUND', { message: 'Chat not found' })
      }
      return { title: existing.title }
    }

    const resource = await db.query.connectionsResources.findFirst({
      columns: { id: true },
      where: {
        connection: { RAW: inMemberWorkspace(data.userId) },
        id: { eq: data.connectionResourceId },
      },
    })
    if (!resource) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Connection resource not found',
      })
    }

    const [inserted] = await db
      .insert(chats)
      .values({
        connectionResourceId: data.connectionResourceId,
        id: data.chatId,
        userId: data.userId,
      })
      .onConflictDoNothing()
      .returning()

    if (inserted) {
      chatsPublisher.publish(data.userId, { type: 'insert', value: inserted })
    }

    return { title: null }
  },
  loadMessages: async (data: { chatId: string; userId: string }) => {
    const rows = await db
      .select({
        messageId: chatsMessages.id,
        metadata: chatsMessages.metadata,
        order: chatsMessagesParts.order,
        part: chatsMessagesParts.part,
        role: chatsMessages.role,
      })
      .from(chatsMessages)
      .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
      .innerJoin(
        chatsMessagesParts,
        eq(chatsMessagesParts.messageId, chatsMessages.id)
      )
      .where(
        and(
          eq(chatsMessages.chatId, data.chatId),
          eq(chats.userId, data.userId)
        )
      )
      .orderBy(asc(chatsMessages.createdAt), asc(chatsMessagesParts.order))

    return messagesFromPartRows(rows)
  },
  markStopped: async (data: { chatId: string; userId: string }) => {
    const lastMessage = await db.query.chatsMessages.findFirst({
      columns: { id: true, metadata: true, role: true },
      orderBy: { createdAt: 'desc' },
      where: { chatId: { eq: data.chatId } },
    })

    if (lastMessage?.role !== 'user') {
      return
    }

    const [updated] = await db
      .update(chatsMessages)
      .set({ metadata: { ...lastMessage.metadata, stopped: true } })
      .where(eq(chatsMessages.id, lastMessage.id))
      .returning()

    if (updated) {
      chatsMessagesPublisher.publish(data.userId, {
        type: 'update',
        value: updated,
      })
    }
  },
  persistMessage: async (data: {
    chatId: string
    message: AppUIMessage
    userId: string
  }) => {
    if (data.message.parts.length === 0) {
      return
    }

    const { inserted, parts } = await db.transaction(async (tx) => {
      const [insertedMessage] = await tx
        .insert(chatsMessages)
        .values({
          chatId: data.chatId,
          id: data.message.id,
          metadata: data.message.metadata ?? null,
          role: data.message.role,
        })
        .onConflictDoNothing()
        .returning()

      if (!insertedMessage) {
        return { inserted: null, parts: [] }
      }

      const insertedParts = await tx
        .insert(chatsMessagesParts)
        .values(
          data.message.parts.map((part, order) => ({
            messageId: insertedMessage.id,
            order,
            part,
          }))
        )
        .returning()

      return { inserted: insertedMessage, parts: insertedParts }
    })

    if (!inserted) {
      return
    }

    chatsMessagesPublisher.publish(data.userId, {
      type: 'insert',
      value: inserted,
    })
    for (const part of parts) {
      chatsMessagesPartsPublisher.publish(data.userId, {
        type: 'insert',
        value: part,
      })
    }
  },
  persistTitle: async (data: {
    chatId: string
    messages: AppUIMessage[]
    userId: string
  }) => {
    await silently(async () => {
      const title = await generateChatTitle({
        messages: data.messages,
        telemetry: aiUsage.telemetry({
          chatId: data.chatId,
          feature: AiFeature.ChatTitle,
          userId: data.userId,
        }),
      })
      if (!title) {
        return
      }

      const [updated] = await db
        .update(chats)
        .set({ title })
        .where(
          and(
            eq(chats.id, data.chatId),
            eq(chats.userId, data.userId),
            isNull(chats.title)
          )
        )
        .returning()

      if (updated) {
        chatsPublisher.publish(data.userId, { type: 'update', value: updated })
      }
    })
  },
}
