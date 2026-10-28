import type { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { toError } from '@tamery/shared/utils'
import type { ChatOnToolCallCallback } from 'ai'
import { isToolUIPart } from 'ai'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'
import { posthog } from '~/lib/posthog'

type AppChat = Chat<AppUIMessage>
type AnyToolCall = Parameters<
  ChatOnToolCallCallback<AppUIMessage>
>[0]['toolCall']
type ToolCall = Exclude<
  AnyToolCall,
  { dynamic: true } | { toolName: 'execute' }
>

const DECLINED = 'The user declined to run this statement.'

const runs = new Map<string, AbortController>()
const decided = new Set<string>()

const getSignal = (chatId: string) => {
  const running = runs.get(chatId)
  if (running && !running.signal.aborted) {
    return running.signal
  }
  const controller = new AbortController()
  runs.set(chatId, controller)
  return controller.signal
}

const addReadOutput = async (
  chat: AppChat,
  { toolCallId, ...toolCall }: ToolCall,
  signal: AbortSignal
) => {
  switch (toolCall.toolName) {
    case 'describe_table': {
      const output = await agentDatabase.describeTable(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'list_connections': {
      const output = agentDatabase.connections('active-workspace')
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'list_tables': {
      const { schemas } = await agentDatabase.tables(toolCall.input)
      return chat.addToolOutput({
        output: { schemas },
        tool: toolCall.toolName,
        toolCallId,
      })
    }
    case 'query': {
      const { run } = await agentDatabase.prepareRead(toolCall.input)
      const output = await run(signal)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    default: {
      return toolCall satisfies never
    }
  }
}

const read = async (chat: AppChat, toolCall: ToolCall) => {
  const result = await Result.tryPromise(() =>
    addReadOutput(chat, toolCall, getSignal(chat.id))
  )
  posthog.capture('ai_chat_tool_run', {
    success: result.isOk(),
    tool: toolCall.toolName,
  })
  if (result.isErr()) {
    void chat.addToolOutput({
      errorText: toError(result.error.cause).message,
      state: 'output-error',
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
    })
  }
}

export const chatToolRuns = {
  /** Answers the model's tool calls in the window. Only reads run on their own: an `execute` waits for the user's Run on its card, whatever the transcript or the data it read says. */
  answer: (chat: AppChat, toolCall: AnyToolCall) => {
    if (!toolCall.dynamic && toolCall.toolName !== 'execute') {
      void read(chat, toolCall)
    }
  },
  stop: (chatId: string) => runs.get(chatId)?.abort(),
  /** Decides a pending `execute` once per window: a second press, or a card remounted mid-run (agent mode, a chat switch), is ignored. A chat reopened from the collections holds no live turns, and `addToolOutput` only finds a call among those, so the transcript is seeded first. */
  write: async ({
    approved,
    chat,
    input,
    toolCallId,
    transcript,
  }: {
    approved: boolean
    chat: AppChat
    input: ChatTools['execute']['input']
    toolCallId: string
    transcript: AppUIMessage[]
  }) => {
    if (decided.has(toolCallId)) {
      return
    }
    decided.add(toolCallId)
    const isLive = chat.messages.some(({ parts }) =>
      parts.some((part) => isToolUIPart(part) && part.toolCallId === toolCallId)
    )
    if (!isLive) {
      chat.messages = transcript
    }
    if (!approved) {
      void chat.addToolOutput({
        errorText: DECLINED,
        state: 'output-error',
        tool: 'execute',
        toolCallId,
      })
      return
    }
    const result = await Result.tryPromise(async () => {
      const { run } = await agentDatabase.prepareWrite(input)
      return run(getSignal(chat.id))
    })
    if (result.isErr()) {
      const error = toError(result.error.cause)
      void chat.addToolOutput({
        errorText: error.message,
        state: 'output-error',
        tool: 'execute',
        toolCallId,
      })
      throw error
    }
    void chat.addToolOutput({
      output: result.value,
      tool: 'execute',
      toolCallId,
    })
  },
}
