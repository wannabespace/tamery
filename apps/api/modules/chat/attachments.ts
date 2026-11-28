import { Buffer } from 'node:buffer'

import type { AppUIMessage } from '@tamery/ai/message'
import { db } from '@tamery/db'
import {
  attachmentRef,
  chatAttachmentsPrefix,
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

/** The bucket file of a reference, under its chat's prefix; null when the chat is gone. */
const fileOf = async (ref: { chatId: string; id: string }) => {
  const chat = await db.query.chats.findFirst({
    columns: { createdAt: true, id: true },
    where: { id: { eq: ref.chatId } },
  })
  return chat && bucket.file(`${chatAttachmentsPrefix(chat)}${ref.id}`)
}

const mapParts = async (
  message: AppUIMessage,
  map: (
    part: AppUIMessage['parts'][number]
  ) => Promise<AppUIMessage['parts'][number]>
) => ({ ...message, parts: await Promise.all(message.parts.map(map)) })

export const attachments = {
  exists: async (ref: { chatId: string; id: string }) => {
    const file = await fileOf(ref)
    return !!(await file?.exists())
  },
  /** Puts each stored file back as a data URL, the only form a model is sent: a link would have the provider fetch it. */
  inline: (messages: AppUIMessage[]) =>
    Promise.all(
      messages.map((message) =>
        mapParts(message, async (part) => {
          if (part.type !== 'file') {
            return part
          }
          const ref = parseAttachmentRef(part.url)
          const file = ref && (await fileOf(ref))
          if (!file) {
            return part
          }
          const bytes = await file.bytes()
          return {
            ...part,
            url: `data:${part.mediaType};base64,${Buffer.from(bytes).toString('base64')}`,
          }
        })
      )
    ),
  read: async (ref: { chatId: string; id: string }) => {
    const file = await fileOf(ref)
    if (!file) {
      throw new Error(`Chat ${ref.chatId} not found`)
    }
    return file.bytes()
  },
  /** Moves the turn's data URLs into the bucket and leaves references in their place, so the transcript every device syncs stays small. */
  store: (chatId: string, message: AppUIMessage) =>
    mapParts(message, async (part) => {
      if (part.type !== 'file' || !part.url.startsWith('data:')) {
        return part
      }
      const ref = { chatId, id: v7() }
      const file = await fileOf(ref)
      if (!file) {
        throw new Error(`Chat ${chatId} not found`)
      }
      await file.write(
        Buffer.from(part.url.slice(part.url.indexOf(',') + 1), 'base64'),
        { type: part.mediaType }
      )
      return { ...part, url: attachmentRef(ref) }
    }),
}
