import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'
import { decodeHTML } from 'entities'

import type { PayingKey } from '../models/own-key'
import { modelsFor, ownKeyWebSearchTools } from '../models/own-key'

const MAX_SOURCES = 8
const GROUNDING_REDIRECT =
  'https://vertexaisearch.cloud.google.com/grounding-api-redirect/'
const PAGE_TIMEOUT_MS = 3000
const TITLE = /<title[^>]*>(?<title>[^<]+)<\/title>/iu

const SEARCH_INSTRUCTIONS = [
  'Search the web for the question and answer it from what you find: the facts, numbers, versions and dates it asks for, in a few sentences.',
  'Say so when the results do not answer it. Never invent a source.',
].join('\n')

const withoutProtocol = (url: string) => url.replace(/^https?:\/\//u, '')

const readTitle = async (response: Response) => {
  if (!response.headers.get('content-type')?.includes('text/html')) {
    return null
  }
  const html = await response.text().catch(() => '')
  const title = TITLE.exec(html)?.groups?.title?.trim()
  return title ? decodeHTML(title) : null
}

// An own Google key searches through Google, whose grounding links are redirects that expire and name only the site, so each is opened for the page it lands on and that page's title.
const openPage = async (page: { title: string | null; url: string }) => {
  if (!page.url.startsWith(GROUNDING_REDIRECT)) {
    return { title: page.title ?? withoutProtocol(page.url), url: page.url }
  }
  const response = await fetch(page.url, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  }).catch(() => null)
  const url = response?.url || page.url
  const title = response?.ok ? await readTitle(response) : null
  return { title: title ?? withoutProtocol(url), url }
}

/** Answers one question from a live web search, with the pages it read. */
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
  const pages = await Promise.all(
    sources.flatMap((source) =>
      source.sourceType === 'url'
        ? [openPage({ title: source.title || null, url: source.url })]
        : []
    )
  )
  const unique = new Map(pages.map((page) => [page.url, page]))
  return {
    answer: text.trim(),
    sources: [...unique.values()].slice(0, MAX_SOURCES),
  }
}
