import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import type { PayingKey } from '../models/own-key'
import { modelsFor, ownKeyWebSearchTools } from '../models/own-key'

const MAX_SOURCES = 8

const SEARCH_INSTRUCTIONS = [
  'Search the web for the question and answer it from what you find: the facts, numbers, versions and dates it asks for, in a few sentences.',
  'Say so when the results do not answer it. Never invent a source.',
].join('\n')

const withoutProtocol = (url: string) => url.replace(/^https?:\/\//u, '')

/** Answers one question from a live web search, with the pages it read as the provider cited them: the API opens none of them, since it runs inside the private network. */
export const searchWeb = async (data: {
  key: PayingKey
  query: string
  signal?: AbortSignal
  telemetry?: TelemetryOptions
}) => {
  const { sources, text } = await generateText({
    abortSignal: data.signal,
    instructions: SEARCH_INSTRUCTIONS,
    model: modelsFor(data.key).search,
    prompt: data.query,
    // The provider's `openrouter.tools.webSearch` does not type-check against this AI SDK, so the server tool goes straight into the request body.
    providerOptions: {
      openrouter: {
        reasoning: { effort: 'low' },
        tools: [
          { parameters: { engine: 'exa' }, type: 'openrouter:web_search' },
        ],
      },
    },
    reasoning: 'low',
    telemetry: data.telemetry,
    tools: ownKeyWebSearchTools(data.key),
  })
  const pages = new Map(
    sources.flatMap((source) =>
      source.sourceType === 'url'
        ? [
            [
              source.url,
              {
                title: source.title || withoutProtocol(source.url),
                url: source.url,
              },
            ] as const,
          ]
        : []
    )
  )
  return {
    answer: text.trim(),
    sources: [...pages.values()].slice(0, MAX_SOURCES),
  }
}
