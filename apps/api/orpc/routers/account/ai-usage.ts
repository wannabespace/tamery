import { db } from '@tamery/db'
import { aiUsage as aiUsageTable } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, count, desc, eq, gte, lte, sql, sum } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

const month = sql<string>`to_char(date_trunc('month', ${aiUsageTable.createdAt}), 'YYYY-MM')`

export const aiUsage = orpc
  .use(authMiddleware)
  .input(
    type({
      'from?': 'Date',
      'to?': 'Date',
    })
  )
  .handler(({ context, input }) =>
    db
      .select({
        calls: count(),
        cost: sum(aiUsageTable.cost).mapWith(Number),
        inputTokens: sum(aiUsageTable.inputTokens).mapWith(Number),
        month,
        outputTokens: sum(aiUsageTable.outputTokens).mapWith(Number),
        ownKey: aiUsageTable.ownKey,
      })
      .from(aiUsageTable)
      .where(
        and(
          eq(aiUsageTable.userId, context.user.id),
          input.from && gte(aiUsageTable.createdAt, input.from),
          input.to && lte(aiUsageTable.createdAt, input.to)
        )
      )
      .groupBy(month, aiUsageTable.ownKey)
      .orderBy(desc(month), aiUsageTable.ownKey)
  )
