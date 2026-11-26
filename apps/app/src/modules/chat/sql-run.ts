import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatDataParts } from '@tamery/ai/tools'
import { toError } from '@tamery/shared/utils'
import type { DataUIPart } from 'ai'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'
import { getCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'

import { getJudgedProbability } from './auto-approval'
import type { QueuedMessage } from './stores'

export const sqlRuns = (message: AppUIMessage) =>
  message.parts.flatMap((part) => (part.type === 'data-sql' ? [part.data] : []))

/** `!` opens a statement the user runs themselves, like a shell command in a terminal agent. */
export const sqlOf = (text: string) =>
  text.startsWith('!') ? text.slice(1).trim() : null

/** Runs the user's own statement on the chat's database, with no approval: they wrote it, as in a Query tab. The part keeps it in the transcript for the agent to read. */
export const runSql = async ({
  connectionResourceId,
  signal,
  skipped,
  statement,
}: {
  connectionResourceId: string
  signal: AbortSignal
  skipped?: QueuedMessage['skipped']
  statement: string
}): Promise<DataUIPart<ChatDataParts>> => {
  const resource =
    getCollections().connectionsResourcesCollection.get(connectionResourceId)
  if (!resource) {
    throw new Error("This chat's database is no longer open.")
  }
  const target = skipped?.target ?? {
    connectionId: resource.connectionId,
    resource: resource.name,
  }
  const toolCallId = skipped?.toolCallId ?? null
  const result = await Result.tryPromise(async () => {
    if (target.connectionId !== resource.connectionId) {
      throw new Error('This chat can only run changes on its own connection.')
    }
    const write = await agentDatabase.prepareWrite({ ...target, statement })
    return { kind: write.kind, output: await write.run(signal) }
  })
  posthog.capture('ai_chat_sql_run', {
    kind: result.isOk() ? result.value.kind : null,
    probability: toolCallId ? getJudgedProbability(toolCallId) : null,
    skipped_change: !!toolCallId,
    success: result.isOk(),
  })
  return {
    data: {
      ...target,
      error: result.isErr() ? toError(result.error.cause).message : null,
      output: result.isOk() ? result.value.output : null,
      statement,
      toolCallId,
    },
    type: 'data-sql',
  }
}
