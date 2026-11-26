import type { AppUIMessage } from '@tamery/ai/message'
import { isToolUIPart } from 'ai'

/** The first result set of a query or change the chat already ran, named by its tool call. */
export const findChatResult = (
  messages: AppUIMessage[],
  toolCallId: string
) => {
  const part = messages
    .flatMap(({ parts }) => parts)
    .find(
      (candidate) =>
        isToolUIPart(candidate) && candidate.toolCallId === toolCallId
    )
  const [set] =
    part &&
    (part.type === 'tool-query' || part.type === 'tool-execute') &&
    part.state === 'output-available'
      ? part.output
      : []
  if (!set) {
    throw new Error(
      `No query result "${toolCallId}" in this chat. Run the query again and use that one.`
    )
  }
  return set
}
