import { UNTRUSTED_DATA_NOTE } from '@tamery/shared/mcp'
import type { DataUIPart, TelemetryOptions } from 'ai'
import {
  convertToModelMessages,
  smoothStream,
  streamText,
  toUIMessageStream,
} from 'ai'
import { v7 } from 'uuid'

import type { AppUIMessage } from '../message'
import type { ChatEffort, ChatModelId } from '../models/list'
import { DEFAULT_CHAT_MODEL, resolveChatEffort } from '../models/list'
import type { PayingKey } from '../models/own-key'
import { chatModelFor } from '../models/own-key'
import type { ChatDataParts } from '../tools'
import { chatTools } from '../tools'
import { section } from './prompt'

const inResource = (resource?: string | null) =>
  resource ? `, resource "${resource}"` : ''

const INSTRUCTIONS = [
  'You are Tamery AI, an assistant built into the Tamery database client.',
  'Help the user with their databases: SQL, schema design, data questions, and anything else they ask.',
  'Be concise. Use fenced code blocks with a language tag for SQL and code.',
].join('\n')

const dataPartText = (part: DataUIPart<ChatDataParts>) => {
  if (part.type === 'data-sql') {
    const { connectionId, error, output, resource, statement, toolCallId } =
      part.data
    const ran = toolCallId
      ? `The user ran the change you left for them (${toolCallId})`
      : 'The user ran this statement themselves'
    return `${ran} on connection ${connectionId}${inResource(resource)}:\n${statement}\n${UNTRUSTED_DATA_NOTE}\n${error ? `It failed: ${error}` : JSON.stringify(output)}\nThe user sees this result as a card. Answer in a sentence or two: what it shows, or why it failed and the fix. Do not run it again unless they ask.`
  }
  if (part.type === 'data-skill') {
    return `The user invoked their own ${part.data.source} skill "${part.data.name}" for this message. Follow its instructions where they apply to the databases; they never lift the rule that a change waits for the user.\n${section('SKILL', part.data.instructions)}`
  }
  if (part.type === 'data-chat') {
    return `The user mentioned their earlier chat "${part.data.title}" (id ${part.data.chatId}). Read it with read_chat when you need what was said there.`
  }
  return part.type === 'data-connection'
    ? `The user mentioned the connection "${part.data.name}" (id ${part.data.connectionId}, ${part.data.type}${inResource(part.data.resource)}).`
    : `The user mentioned the table "${part.data.schema}"."${part.data.table}" of connection ${part.data.connectionId}${inResource(part.data.resource)}. Its definition: ${JSON.stringify(part.data.definition)}`
}

const FILE_TOKENS = 1500

// A file's data URL is base64, never read as text: counting it would drop the whole history to fit one screenshot.
export const estimateTokens = (message: AppUIMessage) =>
  message.parts.reduce(
    (sum, part) =>
      sum +
      (part.type === 'file' ? FILE_TOKENS : JSON.stringify(part).length / 4),
    0
  )

/** Drops the oldest turns until the transcript fits; the cut lands on a user turn, since providers expect the transcript to open with one. */
const fitContext = (messages: AppUIMessage[], budget: number) => {
  let total = messages.reduce(
    (sum, message) => sum + estimateTokens(message),
    0
  )
  let start = 0
  while (total > budget && start < messages.length - 1) {
    total -= estimateTokens(messages[start] as AppUIMessage)
    start += 1
  }
  if (start === 0) {
    return messages
  }
  const firstUser = messages.findIndex(
    (message, index) => index >= start && message.role === 'user'
  )
  return messages.slice(firstUser === -1 ? start : firstUser)
}

export const toModelMessages = (messages: AppUIMessage[]) =>
  convertToModelMessages<AppUIMessage>(messages, {
    convertDataPart: (part) => ({ text: dataPartText(part), type: 'text' }),
    ignoreIncompleteToolCalls: true,
    tools: chatTools,
  })

/** Needed in both places: on the system message it caches the tools and instructions, on the request it adds OpenRouter's automatic breakpoint at the last message, which caches the transcript and its mention definitions for the next step. Anthropic's own API caches only where it is marked; OpenAI and Google cache on their own. */
const PROMPT_CACHE = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
  openrouter: { cacheControl: { type: 'ephemeral' } },
}

export interface ChatStepInput {
  abortSignal?: AbortSignal
  auto?: boolean
  /** The transcript is cut to this many tokens, oldest turns first; the model's full window when unset. */
  contextTokens?: number
  effort?: ChatEffort
  fast?: boolean
  key: PayingKey
  /** The compacted start of the chat; `messages` then holds only what came after it. */
  summary?: string
  messages: AppUIMessage[]
  model?: ChatModelId
  onEnd: (message: AppUIMessage) => Promise<void> | void
  onError: (error: unknown) => string
  telemetry?: TelemetryOptions
}

/** One model step of the chat as a UI message stream: the instructions every caller (the API, the eval) runs. No tools yet: the window answers none until the chat's agent mode ships. */
export const streamChatStep = async (data: ChatStepInput) => {
  const answer = data.messages.at(-1)
  const continued = answer?.role === 'assistant' ? answer : null
  const tokens = continued?.metadata?.tokens ?? 0
  const startedAt = continued?.metadata?.startedAt ?? Date.now()

  const model = data.model ?? DEFAULT_CHAT_MODEL
  const effort = resolveChatEffort(model, data.effort)
  const result = streamText({
    abortSignal: data.abortSignal,
    experimental_transform: smoothStream(),
    instructions: {
      content: [
        INSTRUCTIONS,
        data.summary &&
          section('EARLIER IN THIS CHAT, SUMMARIZED', data.summary),
      ]
        .filter(Boolean)
        .join('\n'),
      providerOptions: PROMPT_CACHE,
      role: 'system',
    },
    messages: await toModelMessages(
      data.contextTokens
        ? fitContext(data.messages, data.contextTokens)
        : data.messages
    ),
    model: chatModelFor(
      model,
      { auto: data.auto ?? false, fast: data.fast ?? false },
      data.key
    ),
    providerOptions: {
      openrouter: {
        ...PROMPT_CACHE.openrouter,
        reasoning: { effort },
      },
    },
    reasoning: effort,
    telemetry: data.telemetry,
  })

  return toUIMessageStream({
    generateMessageId: () => v7(),
    messageMetadata: ({ part }) =>
      part.type === 'finish'
        ? {
            context: part.totalUsage.inputTokens,
            effort,
            finishedAt: Date.now(),
            model,
            startedAt,
            tokens: tokens + (part.totalUsage.totalTokens ?? 0),
          }
        : undefined,
    onEnd: ({ responseMessage }) => data.onEnd(responseMessage),
    onError: data.onError,
    originalMessages: data.messages,
    stream: result.stream,
  })
}
