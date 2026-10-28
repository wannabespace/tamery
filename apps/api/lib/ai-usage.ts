import { AGENT_LIMITS } from '@tamery/ai/limits'
import { AiFeature, createAiUsage } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  aiUsage as aiUsageTable,
  chats,
  connections,
  connectionsResources,
} from '@tamery/db/schema'
import type { Plan } from '@tamery/shared/permissions'
import { and, count, eq, gt, sql, sum } from 'drizzle-orm'

const getWorkspaceIdFromChat = async (chatId: string) => {
  const [row] = await db
    .select({ workspaceId: connections.workspaceId })
    .from(chats)
    .innerJoin(
      connectionsResources,
      eq(chats.connectionResourceId, connectionsResources.id)
    )
    .innerJoin(
      connections,
      eq(connectionsResources.connectionId, connections.id)
    )
    .where(eq(chats.id, chatId))

  return row?.workspaceId ?? null
}

export const aiUsage = createAiUsage(async (record) => {
  await db.insert(aiUsageTable).values({
    ...record,
    workspaceId: record.chatId
      ? await getWorkspaceIdFromChat(record.chatId)
      : null,
  })
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Whether the chat agent spent its plan's rolling-day budget: one `ai_usage` row is one model call, so one step. */
export const isAgentDayLimitReached = async ({
  plan,
  userId,
}: {
  plan: Plan
  userId: string
}) => {
  const [spent] = await db
    .select({
      steps: count(),
      tokens: sum(
        sql`${aiUsageTable.inputTokens} + ${aiUsageTable.outputTokens}`
      ).mapWith(Number),
    })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.userId, userId),
        eq(aiUsageTable.feature, AiFeature.Chat),
        gt(aiUsageTable.createdAt, new Date(Date.now() - DAY_MS))
      )
    )
  const { day } = AGENT_LIMITS[plan]
  return (spent?.steps ?? 0) >= day.steps || (spent?.tokens ?? 0) >= day.tokens
}
