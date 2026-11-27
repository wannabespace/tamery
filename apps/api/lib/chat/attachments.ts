import { Buffer } from 'node:buffer'
import { createHmac, hkdfSync } from 'node:crypto'

import type { AppMessagePart, AppUIMessage } from '@tamery/ai/message'
import {
  attachmentKey,
  attachmentRef,
  parseAttachmentRef,
} from '@tamery/shared/attachments'
import { fileSize } from '@tamery/shared/files'
import { silently } from '@tamery/shared/utils'
import type { FileUIPart } from 'ai'
import { isFileUIPart } from 'ai'
import { S3Client } from 'bun'
import { extractText } from 'unpdf'
import { v7 } from 'uuid'

import { env, nodeEnv } from '~/env'
import { safeEqual } from '~/lib/safe-equal'

/** Only the files of the last `turns` user messages reach the model as files, newest first while their bytes fit; every other one is a line of text naming it. */
export const FRESH_ATTACHMENTS = { bytes: 10 * 1024 * 1024, turns: 3 } as const

/** The long edge past which models scale an image down on their own, so more pixels only cost upload. */
const MODEL_IMAGE_EDGE = 1568

/** A PDF goes to the model as its text when it has at least `perPage` characters a page (less is a scan or mostly pictures) and at most `max` in all (more would not fit a context window as text either). */
const PDF_TEXT = { max: 400_000, perPage: 100 } as const

const bucket = new S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  bucket: env.S3_BUCKET,
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
})

interface Ref {
  chatId: string
  id: string
}

// Under the chat's prefix beside the file, so the purge job deletes them with it.
const modelCopyKey = (ref: Ref) => `${attachmentKey(ref)}.model`
const textKey = (ref: Ref) => `${attachmentKey(ref)}.txt`

// Derived from ENCRYPTION_SECRET's current key: rotating it revokes every link.
const [currentSecret = ''] = env.ENCRYPTION_SECRET.split(',')
const linkKey = Buffer.from(
  hkdfSync('sha256', currentSecret.trim(), '', 'tamery/attachment-link/v1', 32)
)

const signature = (ref: Ref) =>
  createHmac('sha256', linkKey)
    .update(`${ref.chatId}/${ref.id}`)
    .digest('base64url')

/** A link to a stored file that never expires; `/attachments` answers it until the file or its chat is deleted. */
export const attachmentLink = (ref: Ref, mediaType: string) =>
  // OpenRouter takes an image link only when its path ends in an image extension; the AI SDK downloads and inlines any other.
  `${env.API_URL}/attachments/${ref.chatId}/${ref.id}.${mediaType.split('/')[1]}?sig=${signature(ref)}`

const statOrNull = (key: string) =>
  bucket
    .file(key)
    .stat()
    .then(({ size, type }) => ({ key, size, type }))
    .catch(() => null)

/** What the model reads for a stored file: a PDF's text when it has enough, else the downscaled copy when one was made, else the file. */
const modelFile = async (ref: Ref, mediaType: string) => {
  const variant = await statOrNull(
    mediaType === 'application/pdf' ? textKey(ref) : modelCopyKey(ref)
  )
  if (variant) {
    return { ...variant, isText: mediaType === 'application/pdf' }
  }
  const file = await statOrNull(attachmentKey(ref))
  return file && { ...file, isText: false }
}

const storeModelCopy = async (ref: Ref, bytes: Buffer, mediaType: string) => {
  if (mediaType === 'application/pdf') {
    const { text, totalPages } = await extractText(new Uint8Array(bytes), {
      mergePages: true,
    })
    const { length } = text.trim()
    if (length >= totalPages * PDF_TEXT.perPage && length <= PDF_TEXT.max) {
      await bucket.write(textKey(ref), text, { type: 'text/plain' })
    }
    return
  }
  // A GIF may be animated, and Bun encodes no GIF.
  if (mediaType === 'image/gif') {
    return
  }
  const image = new Bun.Image(bytes)
  const { height, width } = await image.metadata()
  if (Math.max(height, width) <= MODEL_IMAGE_EDGE) {
    return
  }
  await bucket.write(
    modelCopyKey(ref),
    await image
      .resize(MODEL_IMAGE_EDGE, MODEL_IMAGE_EDGE, { fit: 'inside' })
      .bytes(),
    { type: mediaType }
  )
}

/** The stored files the model reads in full, by `url`: those of the last `FRESH_ATTACHMENTS.turns` user messages, newest message first, until one would pass the byte budget. A file `sizeOf` does not know is gone and skipped. */
const freshAttachments = (
  messages: AppUIMessage[],
  sizeOf: (url: string) => number | undefined
) => {
  const fresh = new Set<string>()
  let bytes = 0
  const recentFiles = messages
    .filter((message) => message.role === 'user')
    .slice(-FRESH_ATTACHMENTS.turns)
    .toReversed()
    .flatMap((message) => message.parts.filter(isFileUIPart))
  for (const { url } of recentFiles) {
    const size = sizeOf(url)
    if (size === undefined) {
      continue
    }
    if (bytes + size > FRESH_ATTACHMENTS.bytes) {
      break
    }
    bytes += size
    fresh.add(url)
  }
  return fresh
}

const attachmentStub = (
  part: FileUIPart,
  size: number | undefined
): AppMessagePart => ({
  text: `[File "${part.filename ?? 'unnamed'}", ${part.mediaType}, ${size === undefined ? 'no longer stored' : `${fileSize(size)}, shown earlier in this chat`}]`,
  type: 'text',
})

const mapParts = async (
  message: AppUIMessage,
  map: (part: AppMessagePart) => Promise<AppMessagePart>
) => ({ ...message, parts: await Promise.all(message.parts.map(map)) })

const storedRef = (part: AppMessagePart) =>
  part.type === 'file' ? parseAttachmentRef(part.url) : null

export const attachments = {
  exists: (ref: Ref) => bucket.file(attachmentKey(ref)).exists(),
  /** Stored files as the model is sent them: fresh ones as a link in production, where a provider can fetch it, and inline elsewhere; a PDF with enough text as that text; every other one as a line naming it. */
  forModel: async (messages: AppUIMessage[]) => {
    const files = new Map(
      await Promise.all(
        messages
          .flatMap((message) => message.parts)
          .flatMap((part) => {
            const ref = storedRef(part)
            return ref && part.type === 'file' ? [{ part, ref }] : []
          })
          .map(
            async ({ part, ref }) =>
              [part.url, await modelFile(ref, part.mediaType)] as const
          )
      )
    )
    const fresh = freshAttachments(messages, (url) => files.get(url)?.size)

    return Promise.all(
      messages.map((message) =>
        mapParts(message, async (part) => {
          const ref = storedRef(part)
          if (!ref || part.type !== 'file') {
            return part
          }
          const file = files.get(part.url)
          if (!file || !fresh.has(part.url)) {
            return attachmentStub(part, file?.size)
          }
          if (file.isText) {
            return {
              text: `[File "${part.filename ?? 'unnamed'}", the text of a PDF]\n${await bucket.file(file.key).text()}`,
              type: 'text',
            }
          }
          if (nodeEnv === 'production') {
            return { ...part, url: attachmentLink(ref, part.mediaType) }
          }
          const bytes = await bucket.file(file.key).bytes()
          return {
            ...part,
            url: `data:${part.mediaType};base64,${Buffer.from(bytes).toString('base64')}`,
          }
        })
      )
    )
  },
  /** What a signed link serves: the copy the model reads in place of the file (never a PDF's text), or null for a wrong signature or a file that is gone. */
  linked: async (ref: Ref, signed: string) => {
    if (!safeEqual(signed, signature(ref))) {
      return null
    }
    const file =
      (await statOrNull(modelCopyKey(ref))) ??
      (await statOrNull(attachmentKey(ref)))
    const bytes =
      file &&
      (await bucket
        .file(file.key)
        .bytes()
        .catch(() => null))
    return file && bytes && { bytes, type: file.type }
  },
  read: (ref: Ref) => bucket.file(attachmentKey(ref)).bytes(),
  /** Moves the turn's data URLs into the bucket and leaves references in their place, so the transcript every device syncs stays small. The file stays as sent, for the user; a smaller copy for the model goes beside it when one helps. */
  store: (chatId: string, message: AppUIMessage) =>
    mapParts(message, async (part) => {
      if (part.type !== 'file' || !part.url.startsWith('data:')) {
        return part
      }
      const ref = { chatId, id: v7() }
      const bytes = Buffer.from(
        part.url.slice(part.url.indexOf(',') + 1),
        'base64'
      )
      await Promise.all([
        bucket.write(attachmentKey(ref), bytes, { type: part.mediaType }),
        // A file the copy cannot be made from still reaches the model as sent.
        silently(() => storeModelCopy(ref, bytes, part.mediaType)),
      ])
      return { ...part, url: attachmentRef(ref) }
    }),
}
