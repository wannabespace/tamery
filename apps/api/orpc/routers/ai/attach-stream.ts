import { chatStream } from '@tamery/ai/features'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import {
  DEFAULT_CHAT_EFFORT,
  resolveChatContext,
  resolveChatModel,
} from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { chatPersist } from '~/lib/chat-persist'
import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const attachStream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      'context?': 'number.integer > 0',
      'effort?': "'low' | 'medium' | 'high' | 'xhigh'",
      'fast?': 'boolean',
      'model?': 'string',
    })
  )
  .handler(async function* attachStream({ context, input }) {
    const owned = await db.query.chats.findFirst({
      columns: { connectionResourceId: true, parentChatId: true },
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

    if (!(await credits.canChat(context.user.id))) {
      return
    }

    const restarted = await chatStream.claim({
      chatId: input.chatId,
      connection: await chatPersist.connection({
        connectionResourceId: owned.connectionResourceId,
        userId: context.user.id,
      }),
      limits: CHAT_LIMITS.message,
      messages,
      contextTokens: resolveChatContext(
        resolveChatModel(input.model),
        input.context
      ),
      effort: input.effort ?? DEFAULT_CHAT_EFFORT,
      fast: input.fast ?? false,
      isSubagent: !!owned.parentChatId,
      model: resolveChatModel(input.model),
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
