import { AiFeature, createAiUsage } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import {
  aiUsage as aiUsageTable,
  chats,
  connections,
  connectionsResources,
} from '@tamery/db/schema'
import { eq } from 'drizzle-orm'

import { credits } from '~/lib/credits'

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
  if (record.feature === AiFeature.Chat && record.cost) {
    await credits.spend({ cost: record.cost, userId: record.userId })
  }
})
