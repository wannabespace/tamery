import { ORPCError } from '@orpc/server'
import { generateChatTitle } from '@tamery/ai/features'
import type { AppUIMessage } from '@tamery/ai/message'
import { messagesFromPartRows } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chats, chatsMessages, chatsMessagesParts } from '@tamery/db/schema'
import { silently } from '@tamery/shared/utils'
import { isDeepEqualData } from 'ai'
import { and, asc, eq, isNull } from 'drizzle-orm'

import { aiUsage } from '~/lib/ai-usage'
import { publisher as chatsMessagesPartsPublisher } from '~/orpc/routers/chats-messages-parts/events'
import { publisher as chatsMessagesPublisher } from '~/orpc/routers/chats-messages/events'
import { publisher as chatsPublisher } from '~/orpc/routers/chats/events'

export const chatPersist = {
  connection: async (data: {
    connectionResourceId: string
    userId: string
  }) => {
    const resource = await db.query.connectionsResources.findFirst({
      columns: { name: true },
      where: {
        connection: { userId: { eq: data.userId } },
        id: { eq: data.connectionResourceId },
      },
      with: { connection: { columns: { id: true, name: true, type: true } } },
    })
    if (!resource?.connection) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Connection resource not found',
      })
    }
    return { ...resource.connection, resource: resource.name }
  },
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
    const connection = await chatPersist.connection(data)

    const existing = await db.query.chats.findFirst({
      columns: { title: true, userId: true },
      where: { id: { eq: data.chatId } },
    })

    if (existing) {
      if (existing.userId !== data.userId) {
        throw new ORPCError('NOT_FOUND', { message: 'Chat not found' })
      }
      return { connection, title: existing.title }
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

    return { connection, title: null }
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
  /** Inserts a new turn; an assistant turn that already exists grows in place, since tool outputs and the answer after them extend the same message. */
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

      if (insertedMessage) {
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
        return {
          inserted: insertedMessage,
          parts: insertedParts.map((value) => ({
            type: 'insert' as const,
            value,
          })),
        }
      }

      if (data.message.role !== 'assistant') {
        return { inserted: null, parts: [] }
      }

      const existingParts = await tx
        .select({
          id: chatsMessagesParts.id,
          order: chatsMessagesParts.order,
          part: chatsMessagesParts.part,
        })
        .from(chatsMessagesParts)
        .innerJoin(
          chatsMessages,
          eq(chatsMessagesParts.messageId, chatsMessages.id)
        )
        .where(
          and(
            eq(chatsMessages.id, data.message.id),
            eq(chatsMessages.chatId, data.chatId),
            eq(chatsMessages.role, 'assistant')
          )
        )
      if (existingParts.length === 0) {
        return { inserted: null, parts: [] }
      }

      const byOrder = new Map(existingParts.map((row) => [row.order, row]))
      const changed = await Promise.all(
        data.message.parts.map(async (part, order) => {
          const existing = byOrder.get(order)
          if (!existing) {
            const [value] = await tx
              .insert(chatsMessagesParts)
              .values({ messageId: data.message.id, order, part })
              .returning()
            return value && { type: 'insert' as const, value }
          }
          if (isDeepEqualData(existing.part, part)) {
            return null
          }
          const [value] = await tx
            .update(chatsMessagesParts)
            .set({ part })
            .where(eq(chatsMessagesParts.id, existing.id))
            .returning()
          return value && { type: 'update' as const, value }
        })
      )
      return { inserted: null, parts: changed.filter((item) => !!item) }
    })

    if (inserted) {
      chatsMessagesPublisher.publish(data.userId, {
        type: 'insert',
        value: inserted,
      })
    }
    for (const part of parts) {
      chatsMessagesPartsPublisher.publish(data.userId, part)
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
