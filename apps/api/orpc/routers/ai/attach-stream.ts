import { afterCompaction, chatStream, pickChatModel } from '@tamery/ai/features'
import { resolveChatContext } from '@tamery/ai/models'
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

    if (!(await credits.canUseAi(context.user.id))) {
      return
    }

    const scope = {
      chatId: input.chatId,
      feature: AiFeature.Chat,
      userId: context.user.id,
    }
    const model = await pickChatModel({
      messages,
      model: input.model,
      onJevUsage: (usage) => aiUsage.recordPriced(scope, usage),
    })

    const compaction = await chatPersist.compaction(input.chatId)

    const restarted = await chatStream.claim({
      chatId: input.chatId,
      connection: await chatPersist.connection({
        connectionResourceId: owned.connectionResourceId,
        userId: context.user.id,
      }),
      messages: afterCompaction(messages, compaction),
      contextTokens: resolveChatContext(model, input.context),
      effort: input.effort,
      fast: input.fast,
      isSubagent: !!owned.parentChatId,
      model,
      onFinish: (message) =>
        chatPersist.persistMessage({
          chatId: input.chatId,
          message,
          userId: context.user.id,
        }),
      summary: compaction?.summary,
      telemetry: aiUsage.telemetry(scope),
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
