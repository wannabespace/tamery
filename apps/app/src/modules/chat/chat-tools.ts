import type { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { SKIPPED } from '@tamery/ai/tools'
import { toError } from '@tamery/shared/utils'
import type { ChatOnToolCallCallback } from 'ai'
import { isToolUIPart } from 'ai'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'
import { getCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'

import { resumeSubagent } from './subagents-store'

type AppChat = Chat<AppUIMessage>
type AnyToolCall = Parameters<
  ChatOnToolCallCallback<AppUIMessage>
>[0]['toolCall']
type ToolCall = Exclude<
  AnyToolCall,
  { dynamic: true } | { toolName: 'ask_user' | 'execute' }
>

export const DECLINED = 'The user declined to run this statement.'
export const READ_ONLY =
  "This chat only reads that connection: change data or schema only in the chat's own connection. Tell the user and suggest they open a chat in that connection to make the change; its card offers them one."

const runs = new Map<string, AbortController>()
const decided = new Set<string>()

/** A call is decided once per window: a second press, or a card remounted mid-run by a chat switch, is ignored. A chat reopened from the collections holds no live turns, and `addToolOutput` only finds a call among those, so the transcript is seeded first. */
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

const isOwnConnection = (connectionId: string, connectionResourceId: string) =>
  getCollections().connectionsResourcesCollection.get(connectionResourceId)
    ?.connectionId === connectionId

const addReadOutput = async (
  chat: AppChat,
  { toolCallId, ...toolCall }: ToolCall,
  signal: AbortSignal,
  connectionResourceId: string
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
    case 'read_chat': {
      const { pastChats } = await import('./past-chats')
      const output = pastChats.read(toolCall.input.chatId)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'search_chats': {
      const { pastChats } = await import('./past-chats')
      const output = pastChats.search(toolCall.input, chat.id)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'search_saved_queries': {
      const output = agentDatabase.searchSavedQueries(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'search_schema': {
      const output = await agentDatabase.searchSchema(toolCall.input)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'propose_note': {
      const [{ resolveResource }, { schemaNotes }] = await Promise.all([
        import('~/core/agent/target'),
        import('~/core/schema-notes/notes'),
      ])
      const { column, note, schema, table } = toolCall.input
      const { resource } = resolveResource(toolCall.input)
      schemaNotes.add(
        { column, connectionResourceId: resource.id, note, schema, table },
        'agent'
      )
      return chat.addToolOutput({
        output: { note, saved: true },
        tool: toolCall.toolName,
        toolCallId,
      })
    }
    case 'spawn_agent': {
      const { spawnSubagent } = await import('./subagents')
      const output = await spawnSubagent({
        connectionResourceId,
        input: toolCall.input,
        parent: chat,
        signal,
        toolCallId,
      })
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'query': {
      const { run } = await agentDatabase.prepareRead(toolCall.input)
      const output = await run(signal)
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    case 'web_search': {
      const { orpc } = await import('~/lib/orpc')
      const output = await orpc.ai.webSearch.call(
        { chatId: chat.id, query: toolCall.input.query },
        { context: { silent: true }, signal }
      )
      return chat.addToolOutput({ output, tool: toolCall.toolName, toolCallId })
    }
    default: {
      return toolCall satisfies never
    }
  }
}

const read = async (
  chat: AppChat,
  toolCall: ToolCall,
  connectionResourceId: string
) => {
  const result = await Result.tryPromise(() =>
    addReadOutput(chat, toolCall, getSignal(chat.id), connectionResourceId)
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
  /** Answers the model's tool calls in the window. Everything but an `execute` or an `ask_user` runs on its own: those wait for the user on their card, whatever the transcript or the data it read says. A change aimed at another connection than the chat's fails here, and is claimed so its card can never run it, not even in Auto. */
  answer: (
    chat: AppChat,
    toolCall: AnyToolCall,
    connectionResourceId: string
  ) => {
    if (
      !toolCall.dynamic &&
      toolCall.toolName === 'execute' &&
      !isOwnConnection(toolCall.input.connectionId, connectionResourceId)
    ) {
      decided.add(toolCall.toolCallId)
      void chat.addToolOutput({
        errorText: READ_ONLY,
        state: 'output-error',
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
      })
      return
    }
    if (
      !toolCall.dynamic &&
      toolCall.toolName !== 'execute' &&
      toolCall.toolName !== 'ask_user'
    ) {
      void read(chat, toolCall, connectionResourceId)
    }
  },
  reply: ({
    chat,
    output,
    toolCallId,
    transcript,
  }: {
    chat: AppChat
    output: ChatTools['ask_user']['output']
    toolCallId: string
    transcript: AppUIMessage[]
  }) => {
    if (claimDecision(chat, toolCallId, transcript)) {
      void chat.addToolOutput({ output, tool: 'ask_user', toolCallId })
    }
  },
  isDecided: (toolCallId: string) => decided.has(toolCallId),
  /** Answers a change Auto would not run, so the agent goes on without it; its card offers Run to the user. */
  skip: ({
    chat,
    toolCallId,
    transcript,
  }: {
    chat: AppChat
    toolCallId: string
    transcript: AppUIMessage[]
  }) => {
    if (!claimDecision(chat, toolCallId, transcript)) {
      return
    }
    resumeSubagent(chat.id)
    void chat.addToolOutput({
      errorText: SKIPPED,
      state: 'output-error',
      tool: 'execute',
      toolCallId,
    })
  },
  /** Aborted when the user stops the chat: a run, or an auto-run judged before the stop. */
  signal: getSignal,
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
    resumeSubagent(chat.id)
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
