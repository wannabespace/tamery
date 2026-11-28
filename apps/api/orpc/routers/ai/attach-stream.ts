import { chatStream } from '@tamery/ai/features'
import {
  chatEffort,
  chatModelPick,
  MODEL_UNAVAILABLE_MESSAGE,
} from '@tamery/ai/models'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { chatSession } from '~/lib/chat/session'
import { startChatTurn } from '~/lib/chat/turn'
import { aiPermissionsMiddleware, orpc, permix } from '~/orpc'

export const attachStream = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      'effort?': chatEffort,
      'fast?': 'boolean',
      'model?': chatModelPick,
    })
  )
  .errors({ MODEL_UNAVAILABLE: { message: MODEL_UNAVAILABLE_MESSAGE } })
  .handler(async function* attachStream({ context, input }) {
    const owned = await db.query.chats.findFirst({
      columns: {
        compactAt: true,
        connectionResourceId: true,
        parentChatId: true,
        title: true,
      },
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

    // Reattaching to a chat streams nothing rather than failing once the budget is spent; only a restart pays.
    const payer = await payForAi(context)
    if (!payer) {
      return
    }

    const restarted = await startChatTurn({
      chat: {
        compactAt: owned.compactAt ?? context.user.chatCompactAt ?? null,
        connection: await chatSession.connection({
          connectionResourceId: owned.connectionResourceId,
          userId: context.user.id,
        }),
        isSubagent: !!owned.parentChatId,
        title: owned.title,
      },
      chatId: input.chatId,
      payer,
      settings: input,
      userId: context.user.id,
    })
    const racing = restarted ?? (await chatStream.resume(input.chatId))
    if (racing) {
      yield* racing
    }
  })
