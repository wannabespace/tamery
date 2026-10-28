import type { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import { resultSetsType } from '@tamery/ai/tools'
import type { ChatTools } from '@tamery/ai/tools'
import { toError } from '@tamery/shared/utils'
import { bytesToHex } from '@tamery/shared/value-text'
import type { ChatOnToolCallCallback } from 'ai'
import { isToolUIPart } from 'ai'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'
import type { ResultSet } from '~/core/queries/connection/custom'
import { posthog } from '~/lib/posthog'

type AppChat = Chat<AppUIMessage>
type ToolCall = Exclude<
  Parameters<ChatOnToolCallCallback<AppUIMessage>>[0]['toolCall'],
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

const jsonValue = (_key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value)
  }
  return value
}

/** Outputs persist as JSON, and drivers hand over bigint and bytes, which JSON cannot hold. */
const toJsonSets = (sets: ResultSet[]) =>
  resultSetsType.assert(JSON.parse(JSON.stringify(sets, jsonValue)))

const answer = async (
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
      const output = agentDatabase.connections()
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
      const output = toJsonSets(await run(signal))
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    default: {
      return toolCall satisfies never
    }
  }
}

export const chatToolRuns = {
  read: async (chat: AppChat, toolCall: ToolCall) => {
    const result = await Result.tryPromise(() =>
      answer(chat, toolCall, getSignal(chat.id))
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
      posthog.capture('ai_chat_write_declined')
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
      return toJsonSets(await run(getSignal(chat.id)))
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
