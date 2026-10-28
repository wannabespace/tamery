import { ORPCError } from '@orpc/server'
import { generateChatTitle } from '@tamery/ai/features'
import type { AppUIMessage } from '@tamery/ai/message'
import { messagesFromPartRows } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  chats,
  chatsMessages,
  chatsMessagesParts,
  schemaNotes,
} from '@tamery/db/schema'
import { silently } from '@tamery/shared/utils'
import { isDeepEqualData, isToolUIPart } from 'ai'
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
  /** Inserts a new turn; an answer that already exists grows in place, since the reply after its tool calls extends the same message. Only the model's own output comes through here: a window's answer turn goes through `persistToolOutputs`. */
  persistMessage: async (data: {
    chatId: string
    message: AppUIMessage
    userId: string
  }) => {
    if (data.message.parts.length === 0) {
      return
    }

    const { message, parts } = await db.transaction(async (tx) => {
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
          message: { type: 'insert' as const, value: insertedMessage },
          parts: insertedParts.map((value) => ({
            type: 'insert' as const,
            value,
          })),
        }
      }

      if (data.message.role !== 'assistant') {
        return { message: null, parts: [] }
      }

      const [updatedMessage] = await tx
        .update(chatsMessages)
        .set({ metadata: data.message.metadata ?? null })
        .where(
          and(
            eq(chatsMessages.id, data.message.id),
            eq(chatsMessages.chatId, data.chatId),
            eq(chatsMessages.role, 'assistant')
          )
        )
        .returning()
      if (!updatedMessage) {
        return { message: null, parts: [] }
      }

      const existingParts = await tx
        .select()
        .from(chatsMessagesParts)
        .where(eq(chatsMessagesParts.messageId, updatedMessage.id))
      const byOrder = new Map(existingParts.map((row) => [row.order, row]))
      const changed = await Promise.all(
        data.message.parts.map(async (part, order) => {
          const existing = byOrder.get(order)
          if (!existing) {
            const [value] = await tx
              .insert(chatsMessagesParts)
              .values({ messageId: updatedMessage.id, order, part })
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
      return {
        message: { type: 'update' as const, value: updatedMessage },
        parts: changed.filter((item) => !!item),
      }
    })

    if (message) {
      chatsMessagesPublisher.publish(data.userId, message)
    }
    for (const part of parts) {
      chatsMessagesPartsPublisher.publish(data.userId, part)
    }
  },
  /** A window's answer turn may only fill in the outputs of tool calls the model made: its text, steps and usage stay the server's, which the turn limits count. */
  persistToolOutputs: async (data: {
    chatId: string
    message: AppUIMessage
    userId: string
  }) => {
    const existingParts = await db
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

    const updates = existingParts.flatMap((existing) => {
      const part = data.message.parts[existing.order]
      return isToolUIPart(existing.part) &&
        part &&
        isToolUIPart(part) &&
        part.type === existing.part.type &&
        part.toolCallId === existing.part.toolCallId &&
        !isDeepEqualData(existing.part, part)
        ? [{ id: existing.id, part }]
        : []
    })
    const updated = await db.transaction((tx) =>
      Promise.all(
        updates.map(async ({ id, part }) => {
          const [value] = await tx
            .update(chatsMessagesParts)
            .set({ part })
            .where(eq(chatsMessagesParts.id, id))
            .returning()
          return value
        })
      )
    )
    for (const value of updated) {
      if (value) {
        chatsMessagesPartsPublisher.publish(data.userId, {
          type: 'update',
          value,
        })
      }
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
