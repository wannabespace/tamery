import { ORPCError } from '@orpc/server'
import {
  afterCompaction,
  compactMessages,
  generateChatTitle,
  generateNextPrompt,
} from '@tamery/ai/features'
import type { AppUIMessage, ChatCompaction } from '@tamery/ai/message'
import { messagesFromPartRows } from '@tamery/ai/message'
import type { AiKey } from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  chats,
  chatsMessages,
  chatsMessagesParts,
  schemaNotes,
} from '@tamery/db/schema'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { silently } from '@tamery/shared/utils'
import type { TelemetryOptions } from 'ai'
import { isDeepEqualData, isToolUIPart } from 'ai'
import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm'

import type { AiPayer } from '~/lib/ai-key'
import { inMemberWorkspace } from '~/lib/workspace'
import { publisher as chatsMessagesPartsPublisher } from '~/orpc/routers/chats-messages-parts/events'
import { publisher as chatsMessagesPublisher } from '~/orpc/routers/chats-messages/events'
import { publisher as chatsPublisher } from '~/orpc/routers/chats/events'

const saveCompaction = async (data: {
  chatId: string
  compaction: ChatCompaction | null
  userId: string
}) => {
  const [updated] = await db
    .update(chats)
    .set({ compaction: data.compaction })
    .where(and(eq(chats.id, data.chatId), eq(chats.userId, data.userId)))
    .returning()
  if (updated) {
    chatsPublisher.publish(data.userId, { type: 'update', value: updated })
  }
}

export const chatPersist = {
  /** Summarizes everything before the last user message into the chat's compaction, keeping the latest exchange whole so a turn in progress keeps its own messages. Returns the compaction the model should read, the previous one when there is nothing new to fold in or the summary fails. */
  compact: async (data: {
    chatId: string
    history: AppUIMessage[]
    key: AiKey | null
    previous: ChatCompaction | null
    telemetry?: TelemetryOptions
    userId: string
  }) => {
    const { previous } = data
    const lastUser = data.history.findLastIndex(
      (message) => message.role === 'user'
    )
    const older = afterCompaction(
      data.history.slice(0, Math.max(lastUser, 0)),
      previous
    )
    if (older.length === 0) {
      return previous
    }
    const next = await compactMessages({
      key: data.key,
      messages: older,
      previous: previous?.summary,
      telemetry: data.telemetry,
    }).catch((error: unknown) => {
      console.error('chat compaction failed', error)
      return null
    })
    if (!next) {
      return previous
    }
    await saveCompaction({
      chatId: data.chatId,
      compaction: next,
      userId: data.userId,
    })
    return next
  },
  compaction: async (chatId: string) => {
    const chat = await db.query.chats.findFirst({
      columns: { compaction: true },
      where: { id: { eq: chatId } },
    })
    return chat?.compaction ?? null
  },
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
  /** Drops `messageId` and every message after it, so an edited or re-asked turn replaces what followed; a compaction that covered a dropped message goes too. */
  truncateFrom: async (data: {
    chatId: string
    messageId: string
    userId: string
  }) => {
    const target = await db.query.chatsMessages.findFirst({
      columns: { createdAt: true },
      where: { chatId: { eq: data.chatId }, id: { eq: data.messageId } },
    })
    if (!target) {
      return
    }
    // Parts go first and on their own: the cascade would drop them without an event, and a turn stored again under the same id would then show its old parts beside the new ones.
    const { deleted, parts } = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: chatsMessages.id })
        .from(chatsMessages)
        .where(
          and(
            eq(chatsMessages.chatId, data.chatId),
            gte(chatsMessages.createdAt, target.createdAt)
          )
        )
        .orderBy(desc(chatsMessages.createdAt))
      const ids = rows.map(({ id }) => id)
      const deletedParts = await tx
        .delete(chatsMessagesParts)
        .where(inArray(chatsMessagesParts.messageId, ids))
        .returning({
          id: chatsMessagesParts.id,
          messageId: chatsMessagesParts.messageId,
        })
      await tx.delete(chatsMessages).where(inArray(chatsMessages.id, ids))
      return { deleted: ids, parts: deletedParts }
    })
    // Newest first: while the edited message stays shown live, a later message still synced would otherwise list above it for a frame.
    for (const id of deleted) {
      for (const part of parts.filter(({ messageId }) => messageId === id)) {
        chatsMessagesPartsPublisher.publish(data.userId, {
          key: part.id,
          type: 'delete',
        })
      }
      chatsMessagesPublisher.publish(data.userId, { key: id, type: 'delete' })
    }
    const compaction = await chatPersist.compaction(data.chatId)
    if (deleted.some((id) => id === compaction?.throughMessageId)) {
      await saveCompaction({
        chatId: data.chatId,
        compaction: null,
        userId: data.userId,
      })
    }
  },
  ensureChat: async (data: {
    chatId: string
    connectionResourceId: string
    subagent?: { parentChatId: string; title: string }
    userId: string
  }) => {
    const connection = await chatPersist.connection(data)

    const existing = await db.query.chats.findFirst({
      columns: { parentChatId: true, title: true, userId: true },
      where: { id: { eq: data.chatId } },
    })

    if (existing) {
      if (existing.userId !== data.userId) {
        throw new ORPCError('NOT_FOUND', { message: 'Chat not found' })
      }
      return {
        connection,
        isSubagent: !!existing.parentChatId,
        title: existing.title,
      }
    }

    if (data.subagent) {
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

    const [inserted] = await db
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

    if (inserted) {
      chatsPublisher.publish(data.userId, { type: 'insert', value: inserted })
    }

    return {
      connection,
      isSubagent: !!data.subagent,
      title: data.subagent?.title ?? null,
    }
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
  /** Flags the turn's question, never its answer: the answer's row is still being written and its next persist would replace the flag. */
  markStopped: async (data: { chatId: string; userId: string }) => {
    const lastAsked = await db.query.chatsMessages.findFirst({
      columns: { id: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      where: { chatId: { eq: data.chatId }, role: { eq: 'user' } },
    })

    if (!lastAsked) {
      return
    }

    const [updated] = await db
      .update(chatsMessages)
      .set({ metadata: { ...lastAsked.metadata, stopped: true } })
      .where(eq(chatsMessages.id, lastAsked.id))
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
  persistSuggestion: async (data: {
    chatId: string
    history: AppUIMessage[]
    message: AppUIMessage
    payer: AiPayer
    userId: string
  }) => {
    await silently(async () => {
      const suggestion = await generateNextPrompt({
        key: data.payer.key,
        messages: [...data.history, data.message],
        telemetry: data.payer.telemetry({
          chatId: data.chatId,
          feature: AiFeature.ChatSuggestion,
          userId: data.userId,
        }),
      })
      if (!suggestion) {
        return
      }

      const where = and(
        eq(chatsMessages.id, data.message.id),
        eq(chatsMessages.chatId, data.chatId),
        eq(chatsMessages.role, 'assistant')
      )
      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ metadata: chatsMessages.metadata })
          .from(chatsMessages)
          .where(where)
        if (!current) {
          return null
        }
        const [value] = await tx
          .update(chatsMessages)
          .set({ metadata: { ...current.metadata, suggestion } })
          .where(where)
          .returning()
        return value
      })

      if (updated) {
        chatsMessagesPublisher.publish(data.userId, {
          type: 'update',
          value: updated,
        })
      }
    })
  },
  persistTitle: async (data: {
    chatId: string
    messages: AppUIMessage[]
    payer: AiPayer
    userId: string
  }) => {
    await silently(async () => {
      const title = await generateChatTitle({
        key: data.payer.key,
        messages: data.messages,
        telemetry: data.payer.telemetry({
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
        // Titles are stored in plaintext, and one summarizing a pasted connection string would carry its password.
        .set({ title: redactSecrets(title) })
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
