import { createAiUsage } from '@tamery/ai/usage'
import type { AiUsageRecord } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chats, connections, connectionsResources } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'

import { env } from '~/env'
import { credits } from '~/lib/credits'
import { sendEmail } from '~/lib/resend'

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

const alertNoCost = async (record: AiUsageRecord) => {
  const text = JSON.stringify(record, null, 2)
  console.error(`AI usage of ${record.model} has no cost`, text)
  if (env.ALERTS_EMAIL) {
    await sendEmail({
      props: { service: 'AI usage', text },
      subject: `Alert from AI usage: ${record.model} has no cost`,
      template: 'Alert',
      to: env.ALERTS_EMAIL,
    })
  }
}

export const aiUsage = createAiUsage(async (record) => {
  if (
    !(record.ownKey || record.cost) &&
    record.inputTokens + record.outputTokens > 0
  ) {
    await alertNoCost(record)
  }
  await credits.settle({
    ...record,
    workspaceId: record.chatId
      ? await getWorkspaceIdFromChat(record.chatId)
      : null,
  })
})
