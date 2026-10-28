import { chatStream } from '@tamery/ai/features'
import { AGENT_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { aiUsage, isAgentDayLimitReached } from '~/lib/ai-usage'
import { chatPersist } from '~/lib/chat-persist'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const attachStream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(type({ chatId: 'string.uuid.v7' }))
  .handler(async function* attachStream({ context, input }) {
    const owned = await db.query.chats.findFirst({
      columns: { connectionResourceId: true },
      where: { id: { eq: input.chatId }, userId: { eq: context.user.id } },
    })

    if (!owned) {
      return
    }

    const active = await chatStream.resume(input.chatId)
    if (active) {
      yield* active
      return
    }

    const messages = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })
    const lastMessage = messages.at(-1)
    if (lastMessage?.role !== 'user' || lastMessage.metadata?.stopped) {
      return
    }

    if (
      await isAgentDayLimitReached({
        plan: context.plan,
        userId: context.user.id,
      })
    ) {
      return
    }

    const restarted = await chatStream.claim({
      chatId: input.chatId,
      connection: await chatPersist.connection({
        connectionResourceId: owned.connectionResourceId,
        userId: context.user.id,
      }),
      limits: AGENT_LIMITS[context.plan].message,
      messages,
      onFinish: (message) =>
        chatPersist.persistMessage({
          chatId: input.chatId,
          message,
          userId: context.user.id,
        }),
      telemetry: aiUsage.telemetry({
        chatId: input.chatId,
        feature: AiFeature.Chat,
        userId: context.user.id,
      }),
    })
    if (restarted) {
      yield* restarted
      return
    }

    const racing = await chatStream.resume(input.chatId)
    if (racing) {
      yield* racing
    }
  })
