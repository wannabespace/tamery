import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import type { AppUIMessage, ChatCompaction } from '../message'
import type { AiKey } from '../models/own-key'
import { modelsFor } from '../models/own-key'
import { estimateTokens, toModelMessages } from './chat-step'
import { section } from './prompt'

/** Share of the context window past which a new message compacts the chat first. */
const COMPACT_AT = 0.8
const SUMMARY_TOKENS = 4000

const SUMMARY_REQUEST = [
  'Summarize this conversation so another agent can carry it on without the transcript.',
  'Keep every fact it relied on: connections, tables and columns, the SQL that worked and what it returned (exact numbers and names), changes proposed, applied or declined, notes, and what the user still wants.',
  'Drop chatter and failed attempts unless the reason they failed matters. Write in the language of the conversation, as dense plain text.',
].join('\n')

/** The messages the model still reads in full: those after the last compaction. */
export const afterCompaction = (
  messages: AppUIMessage[],
  compaction: ChatCompaction | null
) => {
  if (!compaction) {
    return messages
  }
  const index = messages.findIndex(
    ({ id }) => id === compaction.throughMessageId
  )
  return index === -1 ? messages : messages.slice(index + 1)
}

export const needsCompaction = (messages: AppUIMessage[], window: number) =>
  messages.reduce((sum, message) => sum + estimateTokens(message), 0) >
  window * COMPACT_AT

/** Folds `messages` and any earlier summary into one summary that stands in for everything through the last of them. */
export const compactMessages = async (data: {
  messages: AppUIMessage[]
  previous?: string
  key: AiKey | null
  telemetry?: TelemetryOptions
}): Promise<ChatCompaction | null> => {
  const last = data.messages.at(-1)
  if (!last) {
    return null
  }
  const { text } = await generateText({
    maxOutputTokens: SUMMARY_TOKENS,
    messages: [
      ...(await toModelMessages(data.messages)),
      {
        content: data.previous
          ? `${section('EARLIER SUMMARY', data.previous)}\n${SUMMARY_REQUEST} Fold the earlier summary in.`
          : SUMMARY_REQUEST,
        role: 'user',
      },
    ],
    model: modelsFor(data.key).summary,
    telemetry: data.telemetry,
  })
  return { summary: text.trim(), throughMessageId: last.id }
}
