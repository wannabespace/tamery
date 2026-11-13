import { type } from 'arktype'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'

/** The model the chat answers with; null follows the API's default. */
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

/** Lets `/model` open the composer's model picker. */
export const modelPickerOpenStore = createStore(false)
