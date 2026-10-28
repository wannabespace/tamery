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
  { dynamic: true } | { toolName: 'execute' } | { toolName: 'propose_note' }
>

const DECLINED = 'The user declined to run this statement.'

const runs = new Map<string, AbortController>()
const decided = new Set<string>()

/** A call is decided once per window: a second press, or a card remounted mid-run (agent mode, a chat switch), is ignored. A chat reopened from the collections holds no live turns, and `addToolOutput` only finds a call among those, so the transcript is seeded first. */
const claimDecision = (
  chat: AppChat,
  toolCallId: string,
  transcript: AppUIMessage[]
) => {
  if (decided.has(toolCallId)) {
    return false
  }
  decided.add(toolCallId)
  const isLive = chat.messages.some(({ parts }) =>
    parts.some((part) => isToolUIPart(part) && part.toolCallId === toolCallId)
  )
  if (!isLive) {
    chat.messages = transcript
  }
  return true
}

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
    case 'column_values': {
      const output = await agentDatabase.columnValues(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'combine': {
      const { combineResults } = await import('./combine')
      const output = await combineResults(chat.messages, toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'create_share': {
      const { appActions } = await import('./app-actions')
      const output = appActions.createShare(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'export_result': {
      const { appActions } = await import('./app-actions')
      const output = appActions.exportResult(chat.messages, toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'open_query': {
      const { appActions } = await import('./app-actions')
      const output = appActions.openQuery(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'open_table': {
      const { appActions } = await import('./app-actions')
      const output = appActions.openTable(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'describe_table': {
      const output = await agentDatabase.describeTable(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'explain': {
      const output = await agentDatabase.explain(toolCall.input)
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
    case 'search_saved_queries': {
      const output = agentDatabase.searchSavedQueries(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'search_schema': {
      const output = await agentDatabase.searchSchema(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'propose_change': {
      const output = await agentDatabase.proposeChange(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
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
  /** Answers the model's tool calls in the window. Only reads run on their own: an `execute` waits for the user's Run on its card and a `propose_note` for Save, whatever the transcript or the data it read says. */
  answer: (chat: AppChat, toolCall: AnyToolCall) => {
    if (
      !toolCall.dynamic &&
      toolCall.toolName !== 'execute' &&
      toolCall.toolName !== 'propose_note'
    ) {
      void read(chat, toolCall)
    }
  },
  /** The card saves the note itself; this tells the model what the user kept. */
  note: ({
    chat,
    kept,
    toolCallId,
    transcript,
  }: {
    chat: AppChat
    kept: string | null
    toolCallId: string
    transcript: AppUIMessage[]
  }) => {
    if (claimDecision(chat, toolCallId, transcript)) {
      void chat.addToolOutput({
        output: { note: kept, saved: kept !== null },
        tool: 'propose_note',
        toolCallId,
      })
    }
  },
  stop: (chatId: string) => runs.get(chatId)?.abort(),
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
    if (!claimDecision(chat, toolCallId, transcript)) {
      return
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
