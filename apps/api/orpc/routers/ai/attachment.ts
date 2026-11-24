import { db } from '@tamery/db'
import { type } from 'arktype'

import { attachments } from '~/lib/attachments'
import { authMiddleware, orpc } from '~/orpc'

// Not behind `ai.chat.use`: a user who lost the chat still sees the files in their chats.
export const attachment = orpc
  .use(authMiddleware)
  .input(type({ chatId: 'string.uuid.v7', id: 'string.uuid.v7' }))
  .errors({ NOT_FOUND: { message: 'Attachment not found' } })
  .handler(async ({ context, errors, input }) => {
    const owned = await db.query.chats.findFirst({
      columns: { id: true },
      where: { id: { eq: input.chatId }, userId: { eq: context.user.id } },
    })
    const bytes = owned && (await attachments.read(input).catch(() => null))
    if (!bytes) {
      throw errors.NOT_FOUND()
    }
    return new Blob([bytes])
  })
