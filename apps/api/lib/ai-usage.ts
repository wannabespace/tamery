import { createAiUsage } from '@tamery/ai/usage'
import type { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  aiUsage as aiUsageTable,
  chats,
  connections,
  connectionsResources,
} from '@tamery/db/schema'
import { and, count, eq, gte } from 'drizzle-orm'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const weeklyUsageCount = async (userId: string, feature: AiFeature) => {
  const [row] = await db
    .select({ used: count() })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.userId, userId),
        eq(aiUsageTable.feature, feature),
        gte(aiUsageTable.createdAt, new Date(Date.now() - WEEK_MS))
      )
    )
  return row?.used ?? 0
}

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
