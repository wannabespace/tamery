import type { UIMessage } from 'ai'
import { isTextUIPart } from 'ai'

import type { ChatEffort, ChatModelId } from './models/list'
import type { ChatDataParts, ChatTools } from './tools'

export interface AppMessageMetadata {
  capped?: boolean
  /** Input tokens of the answer's last step: how much of the window the chat fills now. */
  context?: number
  /** The `reasoning.effort` the answer ran at; Auto keeps a turn's tool steps on it. */
  effort?: ChatEffort
  finishedAt?: number
  /** The model that wrote the answer; Auto keeps a turn's tool steps on it. */
  model?: ChatModelId
  /** The user's thumbs on the answer. */
  rating?: 'down' | 'up'
  startedAt?: number
  stopped?: boolean
  /** The user's likely next message, offered as the composer's placeholder once the answer ends. */
  suggestion?: string
  tokens?: number
}

/** The transcript up to `throughMessageId`, summarized; the model reads the summary instead of those messages. */
export interface ChatCompaction {
  summary: string
  throughMessageId: string
}

export type AppUIMessage = UIMessage<
  AppMessageMetadata,
  ChatDataParts,
  ChatTools
>
export type AppMessagePart = AppUIMessage['parts'][number]

export const textFromMessage = (message: Pick<AppUIMessage, 'parts'>) =>
  message.parts
    .filter((part) => isTextUIPart(part))
    .map((part) => part.text)
    .join('\n')
    .trim()

/** A statement the user ran themselves from the composer, which the agent answers like a message. */
export const isSqlRun = (message: Pick<AppUIMessage, 'parts'>) =>
  message.parts.some((part) => part.type === 'data-sql')

interface MessagePartRow {
  order: number
  part: AppMessagePart
  messageId: string
  metadata: AppMessageMetadata | null
  role: AppUIMessage['role']
}

export const messagesFromPartRows = (rows: MessagePartRow[]): AppUIMessage[] =>
  Object.values(Object.groupBy(rows, (row) => row.messageId)).flatMap(
    (group) => {
      const first = group?.[0]
      if (!(first && group)) {
        return []
      }
      return {
        id: first.messageId,
        metadata: first.metadata ?? undefined,
        parts: group
          .toSorted((a, b) => a.order - b.order)
          .map(({ part }) => part),
        role: first.role,
      }
    }
  )

// A message only grows, so the longer copy is the newer one; on a tie the live copy carries tool outputs the row lacks. The row still adds what the server writes after the stream ends (the suggestion).
export const mergeMessages = (
  persisted: AppUIMessage[],
  live: AppUIMessage[]
): AppUIMessage[] => {
  const liveById = new Map(live.map((message) => [message.id, message]))
  const persistedIds = new Set(persisted.map((message) => message.id))
  return [
    ...persisted.map((message) => {
      const current = liveById.get(message.id)
      return current && current.parts.length >= message.parts.length
        ? { ...current, metadata: { ...message.metadata, ...current.metadata } }
        : message
    }),
    ...live.filter((message) => !persistedIds.has(message.id)),
  ]
}
