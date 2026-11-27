import { setTimeout as sleep } from 'node:timers/promises'

import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { judgeStatement as judge } from '@tamery/ai/features'
import type { AppUIMessage } from '@tamery/ai/message'
import { isSqlRun, textFromMessage } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { additiveOnly as mongoAdditiveOnly } from '@tamery/mongo/effects'
import { getDialect, isSqlDialect } from '@tamery/shared/enums/connection-type'
import { additiveOnly, dialects } from '@tamery/sql'
import { type } from 'arktype'

import { redis } from '~/lib/redis'
import { chatPersist } from '~/modules/chat/persist'
import { chatSession } from '~/modules/chat/session'
import { aiPermissionsMiddleware, orpc, paidAiMiddleware, permix } from '~/orpc'

const REQUEST_LIMIT = 4000
// The window judges a call as soon as the model makes it, which can be before the step's answer is stored.
const STORED_CALL_WAIT_MS = 10_000
const STORED_CALL_POLL_MS = 250

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 120,
  prefix: 'ai-judge-statement:',
  window: 60 * 60 * 1000,
})

const pendingExecute = (messages: AppUIMessage[], toolCallId: string) =>
  messages
    .filter(({ role }) => role === 'assistant')
    .flatMap(({ parts }) => parts)
    .flatMap((part) =>
      part.type === 'tool-execute' &&
      part.toolCallId === toolCallId &&
      part.state === 'input-available'
        ? [part]
        : []
    )
    .at(0)

const loadPendingExecute = async (
  data: { chatId: string; toolCallId: string; userId: string },
  deadline = Date.now() + STORED_CALL_WAIT_MS
): Promise<{
  call: NonNullable<ReturnType<typeof pendingExecute>>
  messages: AppUIMessage[]
} | null> => {
  const messages = await chatPersist.loadMessages(data)
  const call = pendingExecute(messages, data.toolCallId)
  if (call) {
    return { call, messages }
  }
  if (Date.now() > deadline) {
    return null
  }
  await sleep(STORED_CALL_POLL_MS)
  return loadPendingExecute(data, deadline)
}

export const judgeStatement = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .use(ratelimit({ key: ({ context }) => context.user.id, limiter }))
  .use(paidAiMiddleware)
  .input(type({ chatId: 'string.uuid.v7', toolCallId: 'string <= 200' }))
  .handler(async ({ context, input, signal }) => {
    const chat = await db.query.chats.findFirst({
      columns: { connectionResourceId: true },
      where: { id: { eq: input.chatId }, userId: { eq: context.user.id } },
    })
    const stored =
      chat &&
      (await loadPendingExecute({
        chatId: input.chatId,
        toolCallId: input.toolCallId,
        userId: context.user.id,
      }))
    if (!(chat && stored)) {
      return null
    }
    // The change, its target and its risk come from the stored call and the chat's own connection, the only one a change may target; the request, the answers to the agent's questions since and the proposal it answers come from the stored transcript. The client sends only which call to judge.
    const connection = await chatSession.connection({
      connectionResourceId: chat.connectionResourceId,
      userId: context.user.id,
    })
    const { statement } = stored.call.input
    // Auto runs the whole statement, so one longer than the judge reads waits for Run.
    if (
      stored.call.input.connectionId !== connection.id ||
      statement.length > REQUEST_LIMIT
    ) {
      return null
    }
    const { messages } = stored
    const asked = messages.findLastIndex(
      (message) => message.role === 'user' && !isSqlRun(message)
    )
    const answers = messages
      .slice(asked + 1)
      .flatMap(({ parts }) => parts)
      .flatMap((part) =>
        part.type === 'tool-ask_user' && part.state === 'output-available'
          ? part.output.answers
          : []
      )
      .map(({ answer, question }) => `${question} ${answer.join(', ')}`)
    const asks = textFromMessage(messages[asked] ?? { parts: [] })
    if (!asks) {
      return null
    }
    const request = [asks, ...answers].join('\n').slice(0, REQUEST_LIMIT)
    const proposal = textFromMessage(
      messages.findLast(
        (message, index) => index < asked && message.role === 'assistant'
      ) ?? { parts: [] }
    ).slice(-REQUEST_LIMIT)
    const dialect = getDialect(connection.type)

    const scope = {
      chatId: input.chatId,
      feature: AiFeature.ApprovalJudge,
      userId: context.user.id,
    }
    return judge({
      additive: isSqlDialect(dialect)
        ? additiveOnly(statement, dialects[dialect])
        : mongoAdditiveOnly(statement),
      dialect,
      key: context.payer.key,
      onJevUsage: context.payer.recordJev(scope),
      proposal,
      request,
      signal,
      statement,
      telemetry: context.payer.telemetry(scope),
    })
  })
