import type { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { isToolUIPart } from 'ai'
import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { getChatInstance, onChatFinish } from '../session/chat-instance'
import { messageParts } from '../session/message-parts'
import { chatQueueStore } from '../stores'
import { awaitsUser } from '../tools/chat-tool-types'
import { setSubagentStatus, subagentsStore } from './subagents-store'

const MAX_RUNNING = 4
const ANSWER_LIMIT = 8000

const lastStep = (message: AppUIMessage) =>
  message.parts.slice(
    message.parts.findLastIndex((part) => part.type === 'step-start') + 1
  )

/** The parent only sees the report, so it is the subagent's whole conversation after its task: each answer, and what the user told it along the way, or the parent reads the extra work as the subagent's own and loses the answer to its task. */
const getReport = (messages: AppUIMessage[]) =>
  messages
    .slice(1)
    .map((message) => {
      const text = textFromMessage(message)
      return message.role === 'user'
        ? `The user then told this subagent: ${text}`
        : text
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, ANSWER_LIMIT)

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
    model: input.model,
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
  posthog.capture('ai_chat_subagent_spawned', {
    model: input.model ?? 'user',
    running: running.length + 1,
  })

  const report = Promise.withResolvers<ChatTools['spawn_agent']['output']>()
  const stopListening = onChatFinish(
    chatId,
    ({ isAbort, isError, message }) => {
      if (isAbort || isError) {
        report.reject(new Error('The subagent stopped before it reported.'))
      } else if (message.parts.some(awaitsUser)) {
        setSubagentStatus(chatId, 'waiting')
      } else if (!lastStep(message).some(isToolUIPart)) {
        // What the user queued for the subagent runs before it reports, or its answer would never reach the parent; the queue is sent here, not by the chat view, which may be closed.
        const [next, ...rest] = chatQueueStore(chatId).get()
        if (next) {
          chatQueueStore(chatId).set(rest)
          void messageParts(next.text, next.mentions, next.files).then(
            (parts) => child.sendMessage({ parts, role: 'user' })
          )
        } else {
          report.resolve({
            answer: getReport(child.messages),
            chatId,
          })
        }
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
