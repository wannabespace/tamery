import { db } from '@tamery/db'
import { aiUsage, chats } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, or, sum } from 'drizzle-orm'

import { orpc, permissionsMiddleware, permix } from '~/orpc'

/** What the chat and its subagents have cost so far, in USD. */
export const chatCost = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(type({ chatId: 'string.uuid.v7' }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select({ cost: sum(aiUsage.cost).mapWith(Number) })
      .from(aiUsage)
      .innerJoin(chats, eq(aiUsage.chatId, chats.id))
      .where(
        and(
          eq(chats.userId, context.user.id),
          or(eq(chats.id, input.chatId), eq(chats.parentChatId, input.chatId))
        )
      )
    return row?.cost ?? 0
  })
