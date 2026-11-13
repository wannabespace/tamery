import type { AppMessagePart, AppUIMessage } from '@tamery/ai/message'
import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { createCollection } from '@tanstack/react-db'

import { persistence } from '~/lib/database'
import { orpc } from '~/lib/orpc'
import type { BaseTable } from '~/lib/sync'
import { PERSISTED_SCHEMA_VERSION, syncCollectionOptions } from '~/lib/sync'

export interface Chat extends BaseTable {
  connectionResourceId: string
  /** Set on a subagent's chat; lists of chats leave those out. */
  parentChatId?: string | null
  title: string | null
}

export interface ChatMessage extends BaseTable {
  chatId: string
  role: AppUIMessage['role']
  metadata: NonNullable<AppUIMessage['metadata']> | null
}

export interface ChatMessagePart extends BaseTable {
  messageId: string
  order: number
  part: AppMessagePart
}

export const createChatsCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<Chat>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.chats.events.call(undefined, {
            signal,
          })) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'chats',
        sync: ({ rows, signal }) => orpc.chats.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )

export const createChatsMessagesCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<ChatMessage>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.chatsMessages.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'chatsMessages',
        sync: ({ rows, signal }) =>
          orpc.chatsMessages.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )

export const createChatsMessagesPartsCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<ChatMessagePart>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.chatsMessagesParts.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'chatsMessagesParts',
        sync: ({ rows, signal }) =>
          orpc.chatsMessagesParts.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )
