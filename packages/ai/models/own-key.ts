import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { AI_KEY_PROVIDERS, getDictationModel } from '@tamery/shared/ai-key'
import type { LanguageModel, Tool, ToolSet, TranscriptionModel } from 'ai'
import { generateText } from 'ai'

import type { ChatModelId, ChatRouting } from './list'
import { chatModel, chatModels, models, openRouterModels } from './list'

/** A user's own provider key, decrypted for one call. */
export interface AiKey {
  key: string
  provider: AiKeyProvider
}

export const TAMERY_ACCOUNT = 'tamery' as const
export type PayingKey = AiKey | typeof TAMERY_ACCOUNT

export const ownApiKey = (key: PayingKey) =>
  key === TAMERY_ACCOUNT ? undefined : key.key

type FixedModels = Record<'fast' | 'search' | 'summary', LanguageModel>

/** A chat model reading the recording from its prompt, or a provider's own speech-to-text model. */
export type Dictation =
  | { kind: 'prompt'; model: LanguageModel }
  | { kind: 'transcription'; model: TranscriptionModel }

interface ProviderModels {
  /** Takes a chat model's OpenRouter id; the routing only reaches OpenRouter. */
  chat: (id: ChatModelId, routing: ChatRouting) => LanguageModel
  /** Takes an id from the provider's dictation models (`getDictationModels`). */
  dictation: ((id: string) => Dictation) | null
  models: FixedModels
  webSearch: { kind: 'tool'; tool: Tool } | { kind: 'openrouter-server-tool' }
}

const bareId = (id: string) => id.replace(/^~?[^/]+\//u, '')

const anthropicModels = (apiKey: string): ProviderModels => {
  const anthropic = createAnthropic({ apiKey })
  return {
    // Anthropic's API spells a version with dashes where OpenRouter has dots.
    chat: (id) => anthropic(bareId(id).replaceAll('.', '-')),
    dictation: null,
    models: {
      fast: anthropic('claude-haiku-5-5'),
      search: anthropic('claude-haiku-5-5'),
      summary: anthropic('claude-sonnet-5-5'),
    },
    webSearch: { kind: 'tool', tool: anthropic.tools.webSearch_20260318() },
  }
}

const googleModels = (apiKey: string): ProviderModels => {
  const google = createGoogleGenerativeAI({ apiKey })
  return {
    chat: (id) => google(bareId(id)),
    dictation: (id) => ({ kind: 'prompt', model: google(id) }),
    models: {
      fast: google('gemini-3.8-flash'),
      search: google('gemini-3.8-flash'),
      summary: google('gemini-3.8-flash'),
    },
    webSearch: { kind: 'tool', tool: google.tools.googleSearch({}) },
  }
}

const openaiModels = (apiKey: string): ProviderModels => {
  const openai = createOpenAI({ apiKey })
  return {
    chat: (id) => openai(bareId(id)),
    dictation: (id) => ({
      kind: 'transcription',
      model: openai.transcription(id),
    }),
    models: {
      fast: openai('gpt-6.1-terra'),
      search: openai('gpt-6.1-terra'),
      summary: openai('gpt-6.1-terra'),
    },
    webSearch: { kind: 'tool', tool: openai.tools.webSearch() },
  }
}

const userOpenRouterModels = (apiKey: string): ProviderModels => {
  const openrouter = createOpenRouter({ apiKey })
  return {
    ...openRouterModels(openrouter),
    dictation: (id) => ({ kind: 'prompt', model: openrouter(id) }),
    webSearch: { kind: 'openrouter-server-tool' },
  }
}

const providerModels = {
  anthropic: anthropicModels,
  google: googleModels,
  openai: openaiModels,
  openrouter: userOpenRouterModels,
} satisfies Record<AiKeyProvider, (apiKey: string) => ProviderModels>

/** What Auto answers with on a provider's own key, since Jev runs only on OpenRouter. */
export const OWN_KEY_AUTO_MODELS = {
  anthropic: 'anthropic/claude-sonnet-5.5',
  google: 'google/gemini-4-argon',
  openai: 'openai/gpt-6.1-sol',
} as const satisfies Record<Exclude<AiKeyProvider, 'openrouter'>, ChatModelId>

/** The key a chat model runs on: its provider's own, else OpenRouter's, which serves every one. */
export const chatKeyFor = (keys: AiKey[], model: (typeof chatModels)[number]) =>
  keys.find(({ provider }) => AI_KEY_PROVIDERS[provider] === model.provider) ??
  keys.find(({ provider }) => provider === 'openrouter') ??
  null

/** The chat models the keys can run; every one without a key. */
export const chatModelsFor = (keys: AiKey[]) =>
  keys.length > 0
    ? chatModels.filter((model) => chatKeyFor(keys, model))
    : chatModels

/** The chat's helper models (titles, suggestions, compaction, web search, dictation) on the user's key; Tamery's otherwise. */
export const modelsFor = (key: PayingKey): FixedModels =>
  key === TAMERY_ACCOUNT ? models : providerModels[key.provider](key.key).models

/** Only an OpenRouter account has cross-provider fallbacks and `:nitro` routing. */
export const chatModelFor = (
  id: ChatModelId,
  routing: ChatRouting,
  key: PayingKey
) =>
  key === TAMERY_ACCOUNT
    ? chatModel(id, routing)
    : providerModels[key.provider](key.key).chat(id, routing)

/** How a call dictates: on Tamery's model without a key, else on the pick of the keys' models; null when none of their providers takes audio. */
export const dictationFor = (
  keys: AiKey[],
  picked: string | null
): Dictation | null => {
  if (keys.length === 0) {
    return { kind: 'prompt', model: models.transcribe }
  }
  const model = getDictationModel(
    keys.map(({ provider }) => provider),
    picked
  )
  const key = keys.find(({ provider }) => provider === model?.provider)
  return (
    (model &&
      key &&
      providerModels[key.provider](key.key).dictation?.(model.id)) ??
    null
  )
}

export const ownKeyWebSearchTools = (key: PayingKey): ToolSet | undefined => {
  if (key === TAMERY_ACCOUNT) {
    return undefined
  }
  const { webSearch } = providerModels[key.provider](key.key)
  return webSearch.kind === 'tool' ? { web_search: webSearch.tool } : undefined
}

/** Throws when the provider refuses the key; a one-token call on the user's bill. */
export const verifyAiKey = async (key: AiKey) => {
  await generateText({
    maxOutputTokens: 16,
    model: modelsFor(key).fast,
    prompt: 'Reply with OK.',
  })
}
