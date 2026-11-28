import type { AppUIMessage } from '@tamery/ai/message'
import { useSubscription } from 'seitu/react'

import type { Subagent } from './subagents-store'
import { subagentsStore } from './subagents-store'

/** A chat's subagents in the order they started: the live ones of this window, then the finished ones of its transcript. */
export const useSubagents = (
  parentChatId: string,
  messages: AppUIMessage[]
) => {
  const live = useSubscription(subagentsStore).filter(
    (agent) => agent.parentChatId === parentChatId
  )
  const finished = messages.flatMap((message) =>
    message.parts.flatMap((part): Subagent[] =>
      part.type === 'tool-spawn_agent' &&
      part.state === 'output-available' &&
      !live.some((agent) => agent.chatId === part.output.chatId)
        ? [
            {
              chatId: part.output.chatId,
              parentChatId,
              status: 'done',
              title: part.input.title,
              toolCallId: part.toolCallId,
            },
          ]
        : []
    )
  )
  return [...finished, ...live]
}
