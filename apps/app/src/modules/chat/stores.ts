import type { FileUIPart } from 'ai'
import { type } from 'arktype'
import { memoize } from 'memoza'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'

import type { PromptMention } from './prompt-mentions'

/** The model the chat answers with; null is Auto, which the API picks per message. */
export const chatModelValue = createWebStorageValue({
  defaultValue: null,
  key: 'chat-model',
  schema: type('string | null'),
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

/** Models the user picked lately, newest first; the picker lists them above the providers. */
export const recentChatModelsValue = createWebStorageValue({
  defaultValue: [],
  key: 'chat-recent-models',
  schema: type('string[]'),
  type: 'localStorage',
})

export type ChatEffort = 'low' | 'medium' | 'high' | 'xhigh'

export interface ChatModelOptions {
  context?: number
  effort?: ChatEffort
  fast?: boolean
}

/** Effort, context window and fast routing per model id; a missing option follows the model's default. */
export const chatModelOptionsValue = createWebStorageValue({
  defaultValue: {} as Record<string, ChatModelOptions>,
  key: 'chat-model-options',
  schema: type({
    '[string]': {
      'context?': 'number',
      'effort?': "'low' | 'medium' | 'high' | 'xhigh'",
      'fast?': 'boolean',
    },
  }),
  type: 'localStorage',
})

export interface ChatDraft {
  resourceId: string
  text: string
  updatedAt: number
}

/** Unsent composer text per chat id; a chat with no messages yet lists as a draft under its database. */
export const chatDraftsValue = createWebStorageValue({
  defaultValue: {} as Record<string, ChatDraft>,
  key: 'chat-drafts',
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

/** Lets `/model` open the composer's model picker. */
export const modelPickerOpenStore = createStore(false)

export interface QueuedMessage {
  files: FileUIPart[]
  id: string
  mentions: PromptMention[]
  text: string
}

/** Messages sent while the agent was still working, oldest first; each goes out once the turn ends. */
export const chatQueueStore = memoize((_chatId: string) =>
  createStore<QueuedMessage[]>([])
)
