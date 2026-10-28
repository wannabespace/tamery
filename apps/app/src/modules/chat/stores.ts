import { type } from 'arktype'
import { memoize } from 'memoza'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'
import { v7 } from 'uuid'

export const chatOpen = memoize((resourceId: string) =>
  createWebStorageValue({
    defaultValue: false,
    key: `chat-open-${resourceId}`,
    schema: type('boolean'),
    type: 'localStorage',
  })
)

export const getChatStore = memoize((id: string) =>
  createWebStorageValue({
    defaultValue: null,
    key: `connection-resource-chat-${id}`,
    schema: type('string | null'),
    type: 'sessionStorage',
  })
)

export const agentModeValue = createWebStorageValue({
  defaultValue: false,
  key: 'agent-mode',
  schema: type('boolean'),
  type: 'localStorage',
})

export const openChatsValue = memoize((resourceId: string) =>
  createWebStorageValue({
    defaultValue: [],
    key: `agent-chats-${resourceId}`,
    schema: type('string[]'),
    type: 'localStorage',
  })
)

/** The id a chat takes once its first message is sent; renewed by New chat so a sent draft is never reopened as blank. */
export const draftChatStore = memoize((_resourceId: string) =>
  createStore(v7())
)
