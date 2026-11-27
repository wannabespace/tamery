import { afterCompaction, chatStream, pickChatModel } from '@tamery/ai/features'
import {
  AUTO_MODEL,
  chatModelPick,
  MODEL_UNAVAILABLE_MESSAGE,
  resolveChatContext,
} from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { attachments } from '~/lib/chat/attachments'
import { chatCompaction } from '~/lib/chat/compaction'
import { chatPersist } from '~/lib/chat/persist'
import { chatSession } from '~/lib/chat/session'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const attachStream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      'agent?': 'true',
      'context?': 'number.integer > 0',
      'effort?': "'low' | 'medium' | 'high' | 'xhigh'",
      'fast?': 'boolean',
      'model?': chatModelPick,
    })
  )
  .errors({ MODEL_UNAVAILABLE: { message: MODEL_UNAVAILABLE_MESSAGE } })
  .handler(async function* attachStream({ context, errors, input }) {
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
    const pick = await pickChatModel({
      effort: input.effort,
      keys: payer.keys,
      messages,
      model: input.model ?? AUTO_MODEL,
      onJevUsage: payer.recordJev(scope),
    })
    if (!pick) {
      throw errors.MODEL_UNAVAILABLE()
    }

    const compaction = await chatCompaction.get(input.chatId)

    const restarted = await chatStream.claim({
      ...pick,
      agent: input.agent ?? false,
      chatId: input.chatId,
      connection: await chatSession.connection({
        connectionResourceId: owned.connectionResourceId,
        userId: context.user.id,
      }),
      messages: afterCompaction(
        await attachments.forModel(messages),
        compaction
      ),
      contextTokens: resolveChatContext(pick.model, input.context),
      fast: input.fast,
      isSubagent: !!owned.parentChatId,
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
