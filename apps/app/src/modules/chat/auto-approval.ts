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

/** `checking` while the judge reads the change, then `run` while it runs; a change Auto would not run is answered as skipped instead. */
export type AutoApproval = 'checking' | 'run'

/** What Auto is doing, by tool call; its card shows it. */
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

const forget = (toolCallId: string) =>
  autoApprovalsStore.set((approvals) => omit(approvals, [toolCallId]))

/** Auto mode for one change: the judge reads it against the user's request and it runs when the judge is sure enough, more so for a change to existing data; otherwise it is skipped, so the agent goes on and the user can run it from its card. It runs where the window answers the call, so a chat out of view or a subagent's closed panel still runs it, and again from a card for a call no window judged yet (after a reload, or Auto switched on). Once per call. */
export const autoApprove = async ({
  chat,
  connectionResourceId,
  input,
  toolCallId,
  transcript,
}: {
  chat: Chat<AppUIMessage>
  connectionResourceId: string
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
  if (!(await chatToolRuns.claim(chat.id, toolCallId))) {
    forget(toolCallId)
    return
  }
  const signal = chatToolRuns.signal(chat.id)
  const run = async () => {
    setApproval(toolCallId, 'run')
    await queryClient.cancelQueries({ queryKey: estimateKey(toolCallId) })
    // A failed run answers the call with its error, which its card shows and the agent can fix.
    await silently(() =>
      chatToolRuns.write({
        approved: true,
        chat,
        connectionResourceId,
        input,
        toolCallId,
        transcript,
      })
    )
  }
  const write = await Result.tryPromise(() => agentDatabase.prepareWrite(input))
  if (write.isErr()) {
    await run()
    return
  }
  const { additive, connection, kind } = write.value
  const verdict = await orpc.ai.judgeStatement
    .call(
      {
        additive,
        chatId: chat.id,
        dialect: connection.type,
        statement: input.statement,
      },
      { context: { silent: true }, signal }
    )
    .catch(() => null)
  const probability = verdict?.judge === 'jev' ? verdict.probability : null
  if (probability !== null) {
    probabilities.set(toolCallId, probability)
  }
  let outcome = verdict ? 'skip' : 'none'
  if (verdict?.autoRun) {
    outcome = 'run'
  }
  posthog.capture('ai_chat_write_judged', {
    additive,
    destructive: kind === 'destructive',
    dialect: getDialect(connection.type),
    judge: verdict?.judge ?? null,
    outcome,
    probability,
  })
  if (signal.aborted) {
    forget(toolCallId)
    return
  }
  if (verdict?.autoRun) {
    await run()
    return
  }
  forget(toolCallId)
  void chatToolRuns.skip({ chat, toolCallId, transcript })
}
