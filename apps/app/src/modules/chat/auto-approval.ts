import type { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { omit, silently } from '@tamery/shared/utils'
import { Result } from 'better-result'
import { createStore } from 'seitu'

import { agentDatabase } from '~/core/agent/database'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import { chatToolRuns } from './chat-tools'
import { approvalModeValue } from './stores'

/** `checking` while the judge reads the change, then `run`, `ask` when it is unsure, or `unjudged` when it could not answer. */
export type AutoApproval = 'ask' | 'checking' | 'run' | 'unjudged'

/** What Auto decided, by tool call; its card shows it. */
export const autoApprovalsStore = createStore<Record<string, AutoApproval>>({})

/** The card's row estimate, cancelled before a run: the pool holds one connection. */
export const estimateKey = (toolCallId: string) => [
  'agent-estimate',
  toolCallId,
]

const probabilities = new Map<string, number>()

/** How sure Jev was that the change matches the request, for the user's Run or Decline to be measured against; null when the fallback judged it or nothing did. */
export const getJudgedProbability = (toolCallId: string) =>
  probabilities.get(toolCallId) ?? null

const setApproval = (toolCallId: string, approval: AutoApproval) =>
  autoApprovalsStore.set((approvals) => ({
    ...approvals,
    [toolCallId]: approval,
  }))

/** Auto mode for one change: the judge reads an additive change against the user's request and runs it when sure. It runs where the window answers the call, so a chat out of view or a subagent's closed panel still runs it, and again from a card for a call no window judged yet (after a reload, or Auto switched on). Once per call. */
export const autoApprove = async ({
  chat,
  input,
  toolCallId,
  transcript,
}: {
  chat: Chat<AppUIMessage>
  input: ChatTools['execute']['input']
  toolCallId: string
  transcript: AppUIMessage[]
}) => {
  if (
    approvalModeValue.get() !== 'auto' ||
    toolCallId in autoApprovalsStore.get() ||
    chatToolRuns.isDecided(toolCallId)
  ) {
    return
  }
  setApproval(toolCallId, 'checking')
  const signal = chatToolRuns.signal(chat.id)
  const write = await Result.tryPromise(() => agentDatabase.prepareWrite(input))
  if (write.isErr() || !write.value.additive) {
    autoApprovalsStore.set((approvals) => omit(approvals, [toolCallId]))
    return
  }
  const { connection, kind } = write.value
  const verdict = await orpc.ai.judgeStatement
    .call(
      { chatId: chat.id, dialect: connection.type, statement: input.statement },
      { context: { silent: true }, signal }
    )
    .catch(() => null)
  let approval: AutoApproval = 'unjudged'
  if (verdict) {
    approval = verdict.autoRun ? 'run' : 'ask'
  }
  if (typeof verdict?.probability === 'number') {
    probabilities.set(toolCallId, verdict.probability)
  }
  posthog.capture('ai_chat_write_judged', {
    destructive: kind === 'destructive',
    dialect: getDialect(connection.type),
    judge: verdict?.judge ?? null,
    outcome: approval === 'unjudged' ? 'none' : approval,
    probability: verdict?.probability ?? null,
  })
  if (approval === 'run' && signal.aborted) {
    approval = 'ask'
  }
  setApproval(toolCallId, approval)
  if (approval === 'run') {
    await queryClient.cancelQueries({ queryKey: estimateKey(toolCallId) })
    // A failed run answers the call with its error, which its card shows.
    await silently(() =>
      chatToolRuns.write({
        approved: true,
        chat,
        input,
        toolCallId,
        transcript,
      })
    )
  }
}
