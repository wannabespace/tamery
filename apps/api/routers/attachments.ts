import { db } from '@tamery/db'
import { Hono } from 'hono'

import { attachments } from '~/lib/attachments'

/** Public: the link a model provider fetches a chat file from (`attachmentLink`). The signature is the only check, so it never expires, and a deleted chat or file answers 404. */
export const attachmentsRouter = new Hono().get('/:chatId/:file', async (c) => {
  const ref = {
    chatId: c.req.param('chatId'),
    id: c.req.param('file').split('.')[0] ?? '',
  }
  const file = await attachments.linked(ref, c.req.query('sig') ?? '')
  const chat =
    file &&
    (await db.query.chats.findFirst({
      columns: { id: true },
      where: { id: { eq: ref.chatId } },
    }))
  if (!file || !chat) {
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
