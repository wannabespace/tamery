import type {
  AppMessagePart,
  AppMessageMetadata,
  AppUIMessage,
} from '@tamery/ai/message'
import { defineRelationsPart } from 'drizzle-orm'
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-orm/arktype'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'
import { encryptedJson } from '../utils'
import { users } from './auth'
import { connectionsResources } from './connections'

export const chats = d.snakeCase.table(
  'chats',
  {
    ...baseTable,
    connectionResourceId: d
      .uuid()
      .references(() => connectionsResources.id, { onDelete: 'cascade' })
      .notNull(),
    /** Set on a subagent's chat: the chat whose agent started it. Chat lists show only chats without one. */
    parentChatId: d
      .uuid()
      .references((): d.AnyPgColumn => chats.id, { onDelete: 'cascade' }),
    title: d.text(),
    userId: d
      .uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    d.index().on(t.userId),
    d.index().on(t.connectionResourceId),
    d.index().on(t.parentChatId),
  ]
)

export const chatsSelectSchema = createSelectSchema(chats)
export const chatsInsertSchema = createInsertSchema(chats)
export const chatsUpdateSchema = createUpdateSchema(chats)

export const chatsMessages = d.snakeCase.table(
  'chats_messages',
  {
    ...baseTable,
    chatId: d
      .uuid()
      .references(() => chats.id, { onDelete: 'cascade' })
      .notNull(),
    metadata: encryptedJson().$type<AppMessageMetadata>(),
    role: d.text().$type<AppUIMessage['role']>().notNull(),
  },
  (t) => [d.index().on(t.chatId), d.index().on(t.role)]
)

export const chatsMessagesSelectSchema = createSelectSchema(chatsMessages)
export const chatsMessagesInsertSchema = createInsertSchema(chatsMessages)
export const chatsMessagesUpdateSchema = createUpdateSchema(chatsMessages)

export const chatsMessagesParts = d.snakeCase.table(
  'chats_messages_parts',
  {
    ...baseTable,
    messageId: d
      .uuid()
      .references(() => chatsMessages.id, { onDelete: 'cascade' })
      .notNull(),
    order: d.integer().notNull(),
    part: encryptedJson().$type<AppMessagePart>().notNull(),
  },
  (t) => [d.index().on(t.messageId)]
)

export const chatsMessagesPartsSelectSchema =
  createSelectSchema(chatsMessagesParts)
export const chatsMessagesPartsInsertSchema =
  createInsertSchema(chatsMessagesParts)
export const chatsMessagesPartsUpdateSchema =
  createUpdateSchema(chatsMessagesParts)

export const chatsRelations = defineRelationsPart(
  { chats, chatsMessages, chatsMessagesParts, connectionsResources, users },
  (r) => ({
    chats: {
      connectionResource: r.one.connectionsResources({
        from: r.chats.connectionResourceId,
        to: r.connectionsResources.id,
      }),
      messages: r.many.chatsMessages(),
      user: r.one.users({
        from: r.chats.userId,
        to: r.users.id,
      }),
    },
    chatsMessages: {
      chat: r.one.chats({
        from: r.chatsMessages.chatId,
        to: r.chats.id,
      }),
      parts: r.many.chatsMessagesParts(),
    },
    chatsMessagesParts: {
      message: r.one.chatsMessages({
        from: r.chatsMessagesParts.messageId,
        to: r.chatsMessages.id,
      }),
    },
  })
)
