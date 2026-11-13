import type { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { isToolUIPart } from 'ai'
import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { getChatInstance, onChatFinish } from './chat-instance'
import { setSubagentStatus, subagentsStore } from './subagents-store'

const MAX_RUNNING = 4
const ANSWER_LIMIT = 8000

const lastStep = (message: AppUIMessage) =>
  message.parts.slice(
    message.parts.findLastIndex((part) => part.type === 'step-start') + 1
  )

// Only these wait for the user; a read is still `input-available` while the window runs it.
const awaitsUser = (message: AppUIMessage) =>
  message.parts.some(
    (part) =>
      (part.type === 'tool-execute' || part.type === 'tool-propose_note') &&
      part.state === 'input-available'
  )

export const spawnSubagent = async ({
  connectionResourceId,
  input,
  parent,
  signal,
  toolCallId,
}: {
  connectionResourceId: string
  input: ChatTools['spawn_agent']['input']
  parent: Chat<AppUIMessage>
  signal: AbortSignal
  toolCallId: string
}) => {
  const running = subagentsStore
    .get()
    .filter(
      (agent) =>
        agent.parentChatId === parent.id &&
        (agent.status === 'running' || agent.status === 'waiting')
    )
  if (running.length >= MAX_RUNNING) {
    throw new Error(
      `At most ${MAX_RUNNING} subagents run at once; wait for one to report.`
    )
  }

  const chatId = v7()
  const child = getChatInstance({
    chatId,
    connectionResourceId,
    subagent: { parentChatId: parent.id, title: input.title },
  })
  subagentsStore.set((all) => [
    ...all,
    {
      chatId,
      parentChatId: parent.id,
      status: 'running',
      title: input.title,
      toolCallId,
    },
  ])
  posthog.capture('ai_chat_subagent_spawned', { running: running.length + 1 })

  const report = Promise.withResolvers<ChatTools['spawn_agent']['output']>()
  const stopListening = onChatFinish(
    chatId,
    ({ isAbort, isError, message }) => {
      if (isAbort || isError) {
        report.reject(new Error('The subagent stopped before it reported.'))
      } else if (awaitsUser(message)) {
        setSubagentStatus(chatId, 'waiting')
      } else if (!lastStep(message).some(isToolUIPart)) {
        report.resolve({
          answer: textFromMessage(message).slice(0, ANSWER_LIMIT),
          chatId,
        })
      }
    }
  )
  const abort = () => {
    void child.stop()
    void orpc.ai.abortStream.call({ chatId })
    report.reject(new Error('Stopped by the user.'))
  }
  signal.addEventListener('abort', abort, { once: true })
  void child.sendMessage({
    parts: [{ text: input.task, type: 'text' }],
    role: 'user',
  })

  try {
    const output = await report.promise
    setSubagentStatus(chatId, 'done')
    return output
  } catch (error) {
    setSubagentStatus(chatId, 'failed')
    throw error
  } finally {
    stopListening()
    signal.removeEventListener('abort', abort)
  }
}
