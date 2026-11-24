import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { AI_KEY_PROVIDERS } from '@tamery/shared/ai-key'
import type { LanguageModel, Tool, ToolSet } from 'ai'
import { generateText } from 'ai'

import type { ChatModelId } from './list'
import { chatModel, chatModels, models, openRouterModels } from './list'

/** A user's own provider key, decrypted for one call. */
export interface AiKey {
  key: string
  provider: AiKeyProvider
}

type FixedModels = Record<'fast' | 'search' | 'summary', LanguageModel> & {
  transcribe: LanguageModel | null
}

interface ProviderModels {
  /** Takes a chat model's OpenRouter id; `fast` only reaches OpenRouter. */
  chat: (id: ChatModelId, fast: boolean, auto: boolean) => LanguageModel
  models: FixedModels
  /** `null` on OpenRouter, whose search is a server tool `searchWeb` asks for in its provider options. */
  webSearch: Tool | null
}

const bareId = (id: string) => id.replace(/^~?[^/]+\//u, '')

const anthropicModels = (apiKey: string): ProviderModels => {
  const anthropic = createAnthropic({ apiKey })
  return {
    // Anthropic's API spells a version with dashes where OpenRouter has dots.
    chat: (id) => anthropic(bareId(id).replaceAll('.', '-')),
    models: {
      fast: anthropic('claude-haiku-5-5'),
      search: anthropic('claude-haiku-5-5'),
      summary: anthropic('claude-sonnet-5-5'),
      transcribe: null,
    },
    webSearch: anthropic.tools.webSearch_20260318(),
  }
}

const googleModels = (apiKey: string): ProviderModels => {
  const google = createGoogleGenerativeAI({ apiKey })
  return {
    chat: (id) => google(bareId(id)),
    models: {
      fast: google('gemini-3.8-flash'),
      search: google('gemini-3.8-flash'),
      summary: google('gemini-3.8-flash'),
      transcribe: google('gemini-3.8-flash'),
    },
    webSearch: google.tools.googleSearch({}),
  }
}

const openaiModels = (apiKey: string): ProviderModels => {
  const openai = createOpenAI({ apiKey })
  return {
    chat: (id) => openai(bareId(id)),
    models: {
      fast: openai('gpt-6.1-terra'),
      search: openai('gpt-6.1-terra'),
      summary: openai('gpt-6.1-terra'),
      transcribe: null,
    },
    webSearch: openai.tools.webSearch(),
  }
}

const userOpenRouterModels = (apiKey: string): ProviderModels => ({
  ...openRouterModels(createOpenRouter({ apiKey })),
  webSearch: null,
})

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

/** The chat models a key can run: its provider's, or every one on an OpenRouter account. */
export const chatModelsFor = (key?: AiKey | null) =>
  key && key.provider !== 'openrouter'
    ? chatModels.filter(
        (model) => model.provider === AI_KEY_PROVIDERS[key.provider]
      )
    : chatModels

/** The chat's helper models (titles, suggestions, compaction, web search, dictation) on the user's key; Tamery's otherwise. */
export const modelsFor = (key?: AiKey | null): FixedModels =>
  key ? providerModels[key.provider](key.key).models : models

/** Only an OpenRouter account has cross-provider fallbacks and `:nitro` routing. */
export const chatModelFor = (
  id: ChatModelId,
  { auto, fast }: { auto: boolean; fast: boolean },
  key?: AiKey | null
) =>
  key
    ? providerModels[key.provider](key.key).chat(id, fast, auto)
    : chatModel(id, fast, auto)

export const canTranscribe = (key?: AiKey | null) =>
  modelsFor(key).transcribe !== null

export const ownKeyWebSearchTools = (
  key?: AiKey | null
): ToolSet | undefined => {
  const webSearch = key && providerModels[key.provider](key.key).webSearch
  return webSearch ? { web_search: webSearch } : undefined
}

/** Throws when the provider refuses the key; a one-token call on the user's bill. */
export const verifyAiKey = async (key: AiKey) => {
  await generateText({
    maxOutputTokens: 16,
    model: modelsFor(key).fast,
    prompt: 'Reply with OK.',
  })
}
