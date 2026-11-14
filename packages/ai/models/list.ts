import { openrouter } from '@openrouter/ai-sdk-provider'
import { createRetryableModel } from 'ai-retry/language-model'

const openrouterModel = (id: string) =>
  openrouter(id, { usage: { include: true } })

export const models = {
  chat: createRetryableModel({
    model: openrouterModel('anthropic/claude-opus-5.5'),
    retries: [
      openrouterModel('openai/gpt-6.1-sol'),
      openrouterModel('x-ai/grok-4.7'),
      openrouterModel('~google/gemini-pro-latest'),
    ],
  }),
  fast: createRetryableModel({
    model: openrouterModel('anthropic/claude-haiku-4.5'),
    retries: [openrouterModel('google/gemini-3.8-flash')],
  }),
  query: createRetryableModel({
    model: openrouterModel('anthropic/claude-opus-5.5'),
    retries: [openrouterModel('x-ai/grok-4.7')],
  }),
  structured: createRetryableModel({
    model: openrouterModel('anthropic/claude-sonnet-5.5'),
    retries: [openrouterModel('x-ai/grok-4.7')],
  }),
}
