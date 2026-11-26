import type { ChatModelPick } from '@tamery/ai/models/list'
import { AUTO_MODEL, chatModelPick } from '@tamery/ai/models/list'
import type { ChatTools } from '@tamery/ai/tools'
import type { FileUIPart } from 'ai'
import { type } from 'arktype'
import { memoize } from 'memoza'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'

import { CHAT_DRAFTS_KEY, CHAT_NEW_IDS_KEY } from '~/lib/constants'

import type { PromptMention } from './prompt-mentions'

/** The model the chat answers with, or Auto, which the API picks per message; a model no longer offered reads as Auto. */
export const chatModelValue = createWebStorageValue({
  defaultValue: AUTO_MODEL as ChatModelPick,
  key: 'chat-model',
  schema: chatModelPick,
  type: 'localStorage',
})

export type ApprovalMode = 'ask' | 'auto'

/** `ask` waits for Run on every change; `auto` lets the approval judge run the changes it is sure of, never a destructive one. */
export const approvalModeValue = createWebStorageValue({
  defaultValue: 'ask' as ApprovalMode,
  key: 'chat-approval-mode',
  schema: type("'ask' | 'auto'"),
  type: 'localStorage',
})

/** Until the user first runs or declines a change, its card also says that changes wait for Run. */
export const hasDecidedChangeValue = createWebStorageValue({
  defaultValue: false,
  key: 'chat-has-decided-change',
  schema: type('boolean'),
  type: 'localStorage',
})

/** Models the user picked lately, newest first; the picker lists them above the providers. */
export const recentChatModelsValue = createWebStorageValue({
  defaultValue: [],
  key: 'chat-recent-models',
  schema: type('string[]'),
  type: 'localStorage',
})

const chatModelOptions = type({
  'context?': 'number',
  'effort?': "'low' | 'medium' | 'high' | 'xhigh'",
  'fast?': 'boolean',
})

export type ChatModelOptions = typeof chatModelOptions.infer

/** Effort, context window and fast routing per model id; a missing option follows the model's default. */
export const chatModelOptionsValue = createWebStorageValue({
  defaultValue: {},
  key: 'chat-model-options',
  schema: type({ '[string]': chatModelOptions }),
  type: 'localStorage',
})

/** Chats whose answer finished while they were not on screen; showing one reads it. */
export const unreadChatsValue = createWebStorageValue({
  defaultValue: [] as string[],
  key: 'chat-unread',
  schema: type('string[]'),
  type: 'localStorage',
})

interface ChatDraft {
  resourceId: string
  text: string
  updatedAt: number
}

/** Unsent composer text per chat id; a chat with no messages yet lists as a draft under its database. */
export const chatDraftsValue = createWebStorageValue({
  defaultValue: {} as Record<string, ChatDraft>,
  key: CHAT_DRAFTS_KEY,
  schema: type({
    '[string]': { resourceId: 'string', text: 'string', updatedAt: 'number' },
  }),
  type: 'localStorage',
})

export const setChatDraft = (
  chatId: string,
  resourceId: string,
  text: string
) =>
  chatDraftsValue.set((all) => {
    const { [chatId]: previous, ...drafts } = all
    if (previous?.text === text) {
      return all
    }
    return text.trim()
      ? { ...drafts, [chatId]: { resourceId, text, updatedAt: Date.now() } }
      : drafts
  })

/** Per resource, the id its unsent chat takes; the `chat` tab and its URL carry none until the first message. */
export const newChatIdsValue = createWebStorageValue({
  defaultValue: {} as Record<string, string>,
  key: CHAT_NEW_IDS_KEY,
  schema: type({ '[string]': 'string' }),
  type: 'localStorage',
})

export const setNewChatId = (resourceId: string, chatId: string) =>
  newChatIdsValue.set((ids) => ({ ...ids, [resourceId]: chatId }))

/** Lets `/model` open the composer's model picker. */
export const modelPickerOpenStore = createStore(false)

export const composerFocusRequestStore = createStore(0)

export interface QueuedMessage {
  files: FileUIPart[]
  id: string
  mentions: PromptMention[]
  text: string
  skipped?: {
    target: Omit<ChatTools['execute']['input'], 'statement'>
    toolCallId: string
  }
}

/** Messages sent while the agent was still working, oldest first; each goes out once the turn ends. */
export const chatQueueStore = memoize((_chatId: string) =>
  createStore<QueuedMessage[]>([])
)
