import { searchWeb } from '@tamery/ai/features'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chats } from '@tamery/db/schema'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { payForAi } from '~/lib/ai-key'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const QUERY_LIMIT = 500

export const webSearch = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      query: `0 < string <= ${QUERY_LIMIT}`,
    })
  )
  .errors({
    NOT_FOUND: { message: 'Chat not found.' },
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
  })
  .handler(async ({ context, errors, input, signal }) => {
    // The search is billed to this chat's cost and workspace, so it must be the user's own.
    const [chat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, input.chatId), eq(chats.userId, context.user.id)))
    if (!chat) {
      throw errors.NOT_FOUND()
    }
    const { key, telemetry } = await payForAi(
      context.user.id,
      errors.TOO_MANY_REQUESTS
    )
    return searchWeb({
      key,
      query: input.query,
      signal,
      telemetry: telemetry({
        chatId: input.chatId,
        feature: AiFeature.WebSearch,
        userId: context.user.id,
      }),
    })
  })
