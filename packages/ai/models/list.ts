import { openrouter } from '@openrouter/ai-sdk-provider'
import { createRetryableModel } from 'ai-retry/language-model'

export const models = {
  chat: createRetryableModel({
    model: openrouter('anthropic/claude-opus-5.5'),
    retries: [
      openrouter('openai/gpt-6.1-sol'),
      openrouter('x-ai/grok-4.7'),
      openrouter('~google/gemini-pro-latest'),
    ],
  }),
  fast: createRetryableModel({
    model: openrouter('anthropic/claude-haiku-4.5'),
    retries: [openrouter('google/gemini-3.8-flash')],
  }),
  query: createRetryableModel({
    model: openrouter('anthropic/claude-opus-5.5'),
    retries: [openrouter('x-ai/grok-4.7')],
  }),
  structured: createRetryableModel({
    model: openrouter('anthropic/claude-sonnet-5.5'),
    retries: [openrouter('x-ai/grok-4.7')],
  }),
}
