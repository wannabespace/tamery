import { openrouter } from '@openrouter/ai-sdk-provider'
import { createRetryableModel } from 'ai-retry/language-model'
import { memoize } from 'memoza'

/** The models the chat offers, first is the default; the picker groups them by provider in this order. Every id is an OpenRouter id that takes tools and `reasoning.effort`; `context` is its window in tokens, from OpenRouter's catalog. */
export const chatModels = [
  {
    id: 'anthropic/claude-opus-5.5',
    context: 1_000_000,
    name: 'Claude Opus 5.5',
    provider: 'Anthropic',
  },
  {
    id: 'anthropic/claude-fable-5.2',
    context: 1_000_000,
    name: 'Claude Fable 5.2',
    provider: 'Anthropic',
  },
  {
    id: 'anthropic/claude-sonnet-5.5',
    context: 1_000_000,
    name: 'Claude Sonnet 5.5',
    provider: 'Anthropic',
  },
  {
    id: 'anthropic/claude-haiku-5.5',
    context: 1_000_000,
    name: 'Claude Haiku 5.5',
    provider: 'Anthropic',
  },
  {
    id: 'openai/gpt-6.1-sol-pro',
    context: 1_050_000,
    name: 'GPT-6.1 Sol Pro',
    provider: 'OpenAI',
  },
  {
    id: 'openai/gpt-6.1-sol',
    context: 1_050_000,
    name: 'GPT-6.1 Sol',
    provider: 'OpenAI',
  },
  {
    id: 'openai/gpt-6.1-terra',
    context: 1_050_000,
    name: 'GPT-6.1 Terra',
    provider: 'OpenAI',
  },
  {
    id: 'google/gemini-4-argon',
    context: 1_048_576,
    name: 'Gemini 4 Argon',
    provider: 'Google',
  },
  {
    id: 'google/gemini-4-carbon',
    context: 1_048_576,
    name: 'Gemini 4 Carbon',
    provider: 'Google',
  },
  {
    id: 'google/gemini-4-neon',
    context: 1_048_576,
    name: 'Gemini 4 Neon',
    provider: 'Google',
  },
  {
    id: 'google/gemini-4-hydrogen',
    context: 1_048_576,
    name: 'Gemini 4 Hydrogen',
    provider: 'Google',
  },
  {
    id: 'google/gemini-3.8-flash',
    context: 1_048_576,
    name: 'Gemini 3.8 Flash',
    provider: 'Google',
  },
  {
    id: 'x-ai/grok-4.7',
    context: 500_000,
    name: 'Grok 4.7',
    provider: 'xAI',
  },
  {
    id: '~deepseek/deepseek-pro-latest',
    context: 1_048_576,
    name: 'DeepSeek Pro',
    provider: 'DeepSeek',
  },
  {
    id: 'moonshotai/kimi-k3.1-pro',
    context: 1_048_576,
    name: 'Kimi K3.1 Pro',
    provider: 'Moonshot',
  },
  {
    id: 'qwen/qwen3.8-max-0902',
    context: 1_000_000,
    name: 'Qwen3.8 Max',
    provider: 'Qwen',
  },
  { id: 'z-ai/glm-5.3', context: 1_048_576, name: 'GLM 5.3', provider: 'Z.ai' },
  {
    id: 'mistralai/mistral-large-4-0',
    context: 1_048_576,
    name: 'Mistral Large 4',
    provider: 'Mistral',
  },
] as const

/** OpenRouter's `reasoning.effort` levels the picker offers, lowest first. */
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const

export type ChatEffort = (typeof CHAT_EFFORTS)[number]

export const DEFAULT_CHAT_EFFORT: ChatEffort = 'medium'

/** The smaller window the picker offers next to a model's full one: older turns are dropped to fit it, which keeps long chats cheaper and faster. */
export const STANDARD_CHAT_CONTEXT = 200_000

/** The windows a model offers, smallest first. */
export const chatContexts = (id: ChatModelId) => {
  const full =
    chatModels.find((model) => model.id === id)?.context ??
    STANDARD_CHAT_CONTEXT
  return full > STANDARD_CHAT_CONTEXT ? [STANDARD_CHAT_CONTEXT, full] : [full]
}

/** A pick outside the model's windows falls back to its full one. */
export const resolveChatContext = (id: ChatModelId, context?: number) => {
  const contexts = chatContexts(id)
  return (
    contexts.find((option) => option === context) ??
    contexts.at(-1) ??
    STANDARD_CHAT_CONTEXT
  )
}

export type ChatModelId = (typeof chatModels)[number]['id']

export const DEFAULT_CHAT_MODEL: ChatModelId = chatModels[0].id

/** Auto's models, lightest first; a chat on Auto answers with one of them. */
export const AUTO_CHAT_MODELS: ChatModelId[] = [
  'anthropic/claude-haiku-5.5',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
]

/** Auto's effort for each level of difficulty, in the same order as `AUTO_CHAT_MODELS`. */
export const AUTO_CHAT_EFFORTS: ChatEffort[] = ['low', 'medium', 'high']

const CHAT_FALLBACKS: ChatModelId[] = [
  'openai/gpt-6.1-sol',
  'x-ai/grok-4.7',
  'google/gemini-4-argon',
]

/** Mistral's id for the editor's fill-in-the-middle completion. */
export const FIM_MODEL = 'codestral-latest'

/** Its usage is recorded under the provider prefix LiteLLM prices it by. */
export const FIM_PRICED_ID = `mistral/${FIM_MODEL}`

/** Each fixed model and the one it retries on. */
export const MODEL_IDS = {
  fast: ['anthropic/claude-haiku-4.5', 'google/gemini-3.8-flash'],
  query: ['anthropic/claude-opus-5.5', 'x-ai/grok-4.7'],
  search: ['google/gemini-3.8-flash', 'anthropic/claude-haiku-4.5'],
  structured: ['anthropic/claude-sonnet-5.5', 'x-ai/grok-4.7'],
  summary: ['google/gemini-3.8-flash', 'anthropic/claude-sonnet-5.5'],
  transcribe: ['google/gemini-3.8-flash', 'google/gemini-4-argon'],
} as const

/** The chat's and every fixed feature's models on one OpenRouter account: Tamery's, or a user's own key. */
export const openRouterModels = (provider: typeof openrouter) => {
  const model = (id: string) => provider(id, { usage: { include: true } })
  const retryable = ([id, fallback]: readonly [string, string]) =>
    createRetryableModel({ model: model(id), retries: [model(fallback)] })
  return {
    // `:nitro` is OpenRouter's shortcut for routing to the fastest providers of a model, not a separate model.
    chat: (id: ChatModelId, fast: boolean) =>
      createRetryableModel({
        model: model(fast ? `${id}:nitro` : id),
        retries: CHAT_FALLBACKS.filter((fallback) => fallback !== id).map(
          (fallback) => model(fallback)
        ),
      }),
    models: {
      fast: retryable(MODEL_IDS.fast),
      query: retryable(MODEL_IDS.query),
      search: retryable(MODEL_IDS.search),
      structured: retryable(MODEL_IDS.structured),
      summary: retryable(MODEL_IDS.summary),
      transcribe: retryable(MODEL_IDS.transcribe),
    },
  }
}

const tamery = openRouterModels(openrouter)

export const chatModel = memoize(tamery.chat, {
  cacheKey: (id, fast) => `${id}:${fast}`,
})

export const { models } = tamery
