import { openrouter } from '@openrouter/ai-sdk-provider'
import { createRetryableModel } from 'ai-retry/language-model'
import { type } from 'arktype'
import { memoize } from 'memoza'

interface ChatModel {
  context: number
  defaultEffort?: ChatEffort
  efforts?: readonly ChatEffort[]
  id: string
  name: string
  provider: string
}

/** The models the chat offers, first is the default; the picker groups them by provider in this order. Every id is an OpenRouter id that takes tools and `reasoning.effort`; from OpenRouter's catalog, `context` is its window in tokens and `efforts` the levels of `CHAT_EFFORTS` it supports (all when unset), with `defaultEffort` replacing `DEFAULT_CHAT_EFFORT` where that is not one of them. */
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
    efforts: ['low', 'medium', 'high'],
    name: 'Gemini 4 Argon',
    provider: 'Google',
  },
  {
    id: 'google/gemini-4-carbon',
    context: 1_048_576,
    efforts: ['low', 'medium', 'high'],
    name: 'Gemini 4 Carbon',
    provider: 'Google',
  },
  {
    id: 'google/gemini-4-neon',
    context: 1_048_576,
    efforts: ['low', 'medium', 'high', 'xhigh'],
    name: 'Gemini 4 Neon',
    provider: 'Google',
  },
  {
    id: 'google/gemini-4-hydrogen',
    context: 1_048_576,
    efforts: ['low', 'medium', 'high', 'xhigh'],
    name: 'Gemini 4 Hydrogen',
    provider: 'Google',
  },
  {
    id: 'google/gemini-3.8-flash',
    context: 1_048_576,
    efforts: ['low', 'medium', 'high'],
    name: 'Gemini 3.8 Flash',
    provider: 'Google',
  },
  {
    id: 'x-ai/grok-4.7',
    context: 500_000,
    efforts: ['low', 'medium', 'high', 'xhigh'],
    name: 'Grok 4.7',
    provider: 'xAI',
  },
  {
    id: '~deepseek/deepseek-pro-latest',
    context: 1_048_576,
    defaultEffort: 'high',
    efforts: ['low', 'high', 'max'],
    name: 'DeepSeek Pro',
    provider: 'DeepSeek',
  },
  {
    id: 'moonshotai/kimi-k3.1-pro',
    context: 1_048_576,
    defaultEffort: 'high',
    efforts: ['low', 'high', 'max'],
    name: 'Kimi K3.1 Pro',
    provider: 'Moonshot',
  },
  {
    id: 'qwen/qwen3.8-max-0902',
    context: 1_000_000,
    efforts: ['low', 'medium', 'high', 'xhigh'],
    name: 'Qwen3.8 Max',
    provider: 'Qwen',
  },
  {
    id: 'z-ai/glm-5.3',
    context: 1_048_576,
    defaultEffort: 'high',
    efforts: ['low', 'high', 'max'],
    name: 'GLM 5.3',
    provider: 'Z.ai',
  },
  {
    id: 'mistralai/mistral-large-4-0',
    context: 1_048_576,
    defaultEffort: 'high',
    efforts: ['high'],
    name: 'Mistral Large 4',
    provider: 'Mistral',
  },
] as const satisfies readonly ChatModel[]

/** OpenRouter's `reasoning.effort` levels the picker offers, lowest first. */
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export type ChatEffort = (typeof CHAT_EFFORTS)[number]

export const chatEffort = type.enumerated(...CHAT_EFFORTS)

export const DEFAULT_CHAT_EFFORT: ChatEffort = 'medium'

/** The window a model reads, in tokens, and the efforts it supports, lowest first. */
export const chatModelVariations = (id: ChatModelId) => {
  const model: ChatModel =
    chatModels.find((option) => option.id === id) ?? chatModels[0]
  return {
    context: model.context,
    defaultEffort: model.defaultEffort ?? DEFAULT_CHAT_EFFORT,
    efforts: model.efforts ?? CHAT_EFFORTS,
  }
}

/** Raised toward 1, a turn compacting at the cap has no room left for its answer and tool steps before the window overflows. */
const COMPACT_SHARE = 0.8

const MIN_COMPACT_AT = 50_000

export const compactAt = type(`number.integer >= ${MIN_COMPACT_AT}`)

/** No pick, or one above the model's cap, compacts at the cap. */
export const resolveCompactAt = (id: ChatModelId, picked: number | null) => {
  const limit = Math.floor(chatModelVariations(id).context * COMPACT_SHARE)
  return Math.min(picked ?? limit, limit)
}

/** A pick outside the model's efforts falls back to its default one. */
export const resolveChatEffort = (id: ChatModelId, effort?: ChatEffort) => {
  const { defaultEffort, efforts } = chatModelVariations(id)
  return efforts.find((option) => option === effort) ?? defaultEffort
}

export type ChatModelId = (typeof chatModels)[number]['id']

export const DEFAULT_CHAT_MODEL: ChatModelId = chatModels[0].id

export const AUTO_MODEL = 'auto'

export const chatModelPick = type.enumerated(
  AUTO_MODEL,
  ...chatModels.map(({ id }) => id)
)

export type ChatModelPick = typeof chatModelPick.infer

export const MODEL_UNAVAILABLE_MESSAGE =
  'None of your AI keys runs the picked model. Pick another model or Auto.'

export interface ChatRouting {
  auto: boolean
  fast: boolean
}

/** Auto's models, lightest first; a chat on Auto answers with one of them. */
export const AUTO_CHAT_MODELS: ChatModelId[] = [
  'anthropic/claude-haiku-5.5',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
]

/** Auto's effort for each level of difficulty, in the same order as `AUTO_CHAT_MODELS`; each must be one its model supports. */
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
  fast: ['anthropic/claude-haiku-5.5', 'google/gemini-3.8-flash'],
  query: ['anthropic/claude-opus-5.5', 'x-ai/grok-4.7'],
  search: ['google/gemini-3.8-flash', 'anthropic/claude-haiku-5.5'],
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
    // Only Auto falls back to another company's model: a model the user picked answers or fails.
    chat: (id: ChatModelId, { auto, fast }: ChatRouting) =>
      createRetryableModel({
        model: model(fast ? `${id}:nitro` : id),
        retries: auto
          ? CHAT_FALLBACKS.filter((fallback) => fallback !== id).map(
              (fallback) => model(fallback)
            )
          : [],
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
  cacheKey: (id, { auto, fast }) => `${id}:${fast}:${auto}`,
})

export const { models } = tamery
