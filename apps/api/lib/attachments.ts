import { Buffer } from 'node:buffer'

import type { AppUIMessage } from '@tamery/ai/message'
import {
  attachmentKey,
  attachmentRef,
  parseAttachmentRef,
} from '@tamery/shared/attachments'
import { S3Client } from 'bun'
import { v7 } from 'uuid'

import { env } from '~/env'

const bucket = new S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  bucket: env.S3_BUCKET,
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
})

const mapParts = async (
  message: AppUIMessage,
  map: (
    part: AppUIMessage['parts'][number]
  ) => Promise<AppUIMessage['parts'][number]>
) => ({ ...message, parts: await Promise.all(message.parts.map(map)) })

export const attachments = {
  exists: (ref: { chatId: string; id: string }) =>
    bucket.file(attachmentKey(ref)).exists(),
  /** Puts each stored file back as a data URL, the only form a model is sent: a link would have the provider fetch it. */
  inline: (messages: AppUIMessage[]) =>
    Promise.all(
      messages.map((message) =>
        mapParts(message, async (part) => {
          if (part.type !== 'file') {
            return part
          }
          const ref = parseAttachmentRef(part.url)
          if (!ref) {
            return part
          }
          const bytes = await bucket.file(attachmentKey(ref)).bytes()
          return {
            ...part,
            url: `data:${part.mediaType};base64,${Buffer.from(bytes).toString('base64')}`,
          }
        })
      )
    ),
  read: (ref: { chatId: string; id: string }) =>
    bucket.file(attachmentKey(ref)).bytes(),
  /** Moves the turn's data URLs into the bucket and leaves references in their place, so the transcript every device syncs stays small. */
  store: (chatId: string, message: AppUIMessage) =>
    mapParts(message, async (part) => {
      if (part.type !== 'file' || !part.url.startsWith('data:')) {
        return part
      }
      const ref = { chatId, id: v7() }
      await bucket.write(
        attachmentKey(ref),
        Buffer.from(part.url.slice(part.url.indexOf(',') + 1), 'base64'),
        { type: part.mediaType }
      )
      return { ...part, url: attachmentRef(ref) }
    }),
}
