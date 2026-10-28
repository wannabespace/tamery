import { CHAT_LIMITS } from '@tamery/ai/limits'
import { AiFeature, createAiUsage } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  aiUsage as aiUsageTable,
  chats,
  connections,
  connectionsResources,
} from '@tamery/db/schema'
import { and, eq, gt, sum } from 'drizzle-orm'

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

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/** Whether the chat's model calls cost the month's budget: since the paid period started, at most 30 days back, so a monthly plan renews with its payment and a yearly one rolls. A call whose model has no known price counts as free. */
export const isChatBudgetSpent = async ({
  periodStart,
  userId,
}: {
  periodStart: Date | null
  userId: string
}) => {
  const monthAgo = Date.now() - MONTH_MS
  const since = new Date(Math.max(periodStart?.getTime() ?? 0, monthAgo))
  const [spent] = await db
    .select({ cost: sum(aiUsageTable.cost).mapWith(Number) })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.userId, userId),
        eq(aiUsageTable.feature, AiFeature.Chat),
        gt(aiUsageTable.createdAt, since)
      )
    )
  return (spent?.cost ?? 0) >= CHAT_LIMITS.monthlyCostUsd
}
