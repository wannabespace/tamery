import { db } from '@tamery/db'
import { attachmentRef } from '@tamery/shared/attachments'
import { Hono } from 'hono'

import { attachments } from '~/modules/chat/attachments'

/** Public: the link a model provider fetches a chat file from (`attachmentLink`). The signature is the only credential, so the link expires, and it answers 404 once its file is no longer in a message of the chat. */
export const attachmentsRouter = new Hono().get('/:chatId/:file', async (c) => {
  const ref = {
    chatId: c.req.param('chatId'),
    id: c.req.param('file').split('.')[0] ?? '',
  }
  if (!attachments.isSigned(ref, c.req.query('expires'), c.req.query('sig'))) {
    return c.notFound()
  }
  const asked = await db.query.chatsMessages.findMany({
    columns: { id: true },
    where: { chatId: { eq: ref.chatId }, role: { eq: 'user' } },
    with: { parts: { columns: { part: true } } },
  })
  const url = attachmentRef(ref)
  const isInChat = asked.some(({ parts }) =>
    parts.some(({ part }) => part.type === 'file' && part.url === url)
  )
  const file = isInChat && (await attachments.linked(ref))
  if (!file) {
    return c.notFound()
  }
  return c.body(file.bytes, 200, {
    // Cloudflare caches by extension unless told not to, and would keep serving a file after its chat is deleted.
    'cache-control': 'no-store',
    // The type is whatever the user's client declared, so a browser opening the link must not render it on the API's origin.
    'content-disposition': 'attachment',
    'content-type': file.type,
    'x-content-type-options': 'nosniff',
  })
})
