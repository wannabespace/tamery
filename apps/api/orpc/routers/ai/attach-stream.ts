import { afterCompaction, chatStream, pickChatModel } from '@tamery/ai/features'
import { resolveChatContext } from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { chatPersist } from '~/lib/chat-persist'
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

    const payer = await payForAi(
      context.user.id,
      () => new Error('No key or AI budget')
    ).catch(() => null)
    if (!payer) {
      return
    }

    const scope = {
      chatId: input.chatId,
      feature: AiFeature.Chat,
      userId: context.user.id,
    }
    const { auto, effort, model } = await pickChatModel({
      effort: input.effort,
      key: payer.key,
      messages,
      model: input.model,
      onJevUsage: payer.recordJev(scope),
    })

    const compaction = await chatPersist.compaction(input.chatId)

    const restarted = await chatStream.claim({
      auto,
      chatId: input.chatId,
      connection: await chatPersist.connection({
        connectionResourceId: owned.connectionResourceId,
        userId: context.user.id,
      }),
      messages: afterCompaction(messages, compaction),
      contextTokens: resolveChatContext(model, input.context),
      effort,
      fast: input.fast,
      isSubagent: !!owned.parentChatId,
      key: payer.key,
      model,
      onFinish: (message) =>
        chatPersist.persistMessage({
          chatId: input.chatId,
          message,
          userId: context.user.id,
        }),
      summary: compaction?.summary,
      telemetry: payer.telemetry(scope),
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
