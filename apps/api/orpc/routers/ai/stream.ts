import { chatStream } from '@tamery/ai/features'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import type { AppUIMessage } from '@tamery/ai/message'
import {
  chatEffort,
  chatModelPick,
  MODEL_UNAVAILABLE_MESSAGE,
} from '@tamery/ai/models'
import { parseAttachmentRef } from '@tamery/shared/attachments'
import { validateUIMessages } from 'ai'
import { type } from 'arktype'

import { attachments } from '~/lib/chat/attachments'
import { chatPersist } from '~/lib/chat/persist'
import { chatSession } from '~/lib/chat/session'
import { startChatTurn } from '~/lib/chat/turn'
import { aiPermissionsMiddleware, orpc, paidAiMiddleware, permix } from '~/orpc'

const isAttachmentId = type('string.uuid.v7')

// A file arrives as a data URL, or as a reference to one already stored in this chat when a turn is edited or asked again; a remote URL would have the model provider fetch it on the user's behalf.
const attachmentsFit = async (chatId: string, message: AppUIMessage) => {
  const files = message.parts.filter((part) => part.type === 'file')
  if (files.length > CHAT_LIMITS.attachments) {
    return false
  }
  const fits = await Promise.all(
    files.map((file) => {
      if (!CHAT_LIMITS.attachmentTypes.has(file.mediaType)) {
        return false
      }
      const ref = parseAttachmentRef(file.url)
      if (ref) {
        return (
          ref.chatId === chatId &&
          isAttachmentId.allows(ref.id) &&
          attachments.exists(ref)
        )
      }
      const prefix = `data:${file.mediaType};base64,`
      return (
        file.url.startsWith(prefix) &&
        ((file.url.length - prefix.length) * 3) / 4 <=
          CHAT_LIMITS.attachmentBytes
      )
    })
  )
  return fits.every(Boolean)
}

export const stream = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      connectionResourceId: 'string.uuid.v7',
      messages: 'object[]',
      'effort?': chatEffort,
      'fast?': 'boolean',
      'model?': chatModelPick,
      'subagent?': {
        parentChatId: 'string.uuid.v7',
        title: `string <= ${CHAT_LIMITS.subagentTitle}`,
      },
    })
  )
  .errors({
    BAD_REQUEST: { message: 'Invalid messages' },
    CONFLICT: { message: 'This chat is already generating an answer.' },
    MODEL_UNAVAILABLE: { message: MODEL_UNAVAILABLE_MESSAGE },
  })
  .use(paidAiMiddleware)
  .handler(async function* streamHandler({ context, errors, input }) {
    const messages = await validateUIMessages<AppUIMessage>({
      messages: input.messages,
    }).catch(() => {
      throw errors.BAD_REQUEST()
    })

    const turn = messages.at(-1)
    if (!turn || turn.role === 'system') {
      throw errors.BAD_REQUEST()
    }

    const chat = await chatSession.ensureChat({
      chatId: input.chatId,
      connectionResourceId: input.connectionResourceId,
      subagent: input.subagent,
      userId: context.user.id,
    })
    if (!(await attachmentsFit(input.chatId, turn))) {
      throw errors.BAD_REQUEST()
    }

    const owner = { chatId: input.chatId, userId: context.user.id }
    const started = await startChatTurn({
      ...owner,
      chat: {
        ...chat,
        compactAt: chat.compactAt ?? context.user.chatCompactAt ?? null,
      },
      payer: context.payer,
      persistTurn: async () => {
        if (turn.role !== 'user') {
          await chatPersist.persistToolOutputs({ ...owner, message: turn })
          return
        }
        await chatPersist.truncateFrom({ ...owner, messageId: turn.id })
        await chatPersist.persistMessage({
          ...owner,
          message: await attachments.store(input.chatId, turn),
        })
      },
      settings: input,
    })

    if (started) {
      yield* started
      return
    }

    const active = await chatStream.resume(input.chatId)
    if (!active) {
      throw errors.CONFLICT()
    }

    yield* active
  })
