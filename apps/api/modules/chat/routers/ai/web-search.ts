import { searchWeb } from '@tamery/ai/features'
import { logProviderError } from '@tamery/ai/provider-error'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chats } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { aiPermissionsMiddleware, orpc, paidAiMiddleware, permix } from '~/orpc'

const QUERY_LIMIT = 500

export const webSearch = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      query: `0 < string <= ${QUERY_LIMIT}`,
    })
  )
  .errors({
    INTERNAL_SERVER_ERROR: { message: 'The web search failed. Try again.' },
    NOT_FOUND: { message: 'Chat not found.' },
  })
  .use(paidAiMiddleware)
  .handler(async ({ context, errors, input, signal }) => {
    // The search is billed to this chat's cost and workspace, so it must be the user's own.
    const [chat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, input.chatId), eq(chats.userId, context.user.id)))
    if (!chat) {
      throw errors.NOT_FOUND()
    }
    try {
      return await searchWeb({
        key: context.payer.key,
        query: input.query,
        signal,
        telemetry: context.payer.telemetry({
          chatId: input.chatId,
          feature: AiFeature.WebSearch,
          userId: context.user.id,
        }),
      })
    } catch (error) {
      logProviderError('web search', error)
      throw errors.INTERNAL_SERVER_ERROR()
    }
  })
