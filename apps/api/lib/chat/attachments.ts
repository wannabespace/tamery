import { Buffer } from 'node:buffer'
import { createHmac, hkdfSync } from 'node:crypto'

import { section } from '@tamery/ai/features/prompt'
import type { AppMessagePart, AppUIMessage } from '@tamery/ai/message'
import { isContinue, isSqlRun } from '@tamery/ai/message'
import { parseKeyring } from '@tamery/db/utils'
import {
  attachmentKey,
  attachmentRef,
  parseAttachmentRef,
} from '@tamery/shared/attachments'
import { UNTRUSTED_FILE_NOTE } from '@tamery/shared/mcp'
import { silently } from '@tamery/shared/utils'
import { isFileUIPart } from 'ai'
import { S3Client } from 'bun'
import { extractText, getDocumentProxy } from 'unpdf'
import { v7 } from 'uuid'

import { env, nodeEnv } from '~/env'
import { safeEqual } from '~/lib/safe-equal'

/** The files of the last `turns` messages the user wrote reach the model as files: all of the latest one's, and an older one's, newest first, while it still fits `bytes` with the files before it. Every other one is a line of text naming it. */
export const FRESH_ATTACHMENTS = { bytes: 10 * 1024 * 1024, turns: 3 } as const

/** `edge`: the long edge past which models scale an image down on their own, so more pixels only cost upload. `maxPixels`: a larger image is never decoded, since four of them at once would exhaust an instance's memory; it goes to the model as sent. */
const MODEL_IMAGE = { edge: 1568, maxPixels: 25_000_000 } as const

/** A PDF goes to the model as its text when it has at most `pages` pages (more costs too much to parse), at least `perPage` characters a page (less is a scan or mostly pictures) and at most `max` in all (more would not fit a context window as text either). */
const PDF_TEXT = { max: 400_000, pages: 300, perPage: 100 } as const

/** A link stays the same through a week, so the cached transcript prefix holds, and stops working two to three weeks after it is made. */
const LINK_WEEK_SECONDS = 7 * 24 * 60 * 60

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

const linkKey = (secret: string) =>
  Buffer.from(hkdfSync('sha256', secret, '', 'tamery/attachment-link/v1', 32))
const keyring = parseKeyring(env.ENCRYPTION_SECRET)
// Signed with the current key, opened under any key of the keyring: a link outlives a rotation until its key is dropped.
const signingKey = linkKey(keyring.current)
const openingKeys = keyring.all.map(linkKey)

const signature = (key: Buffer, ref: Ref, expires: number) =>
  createHmac('sha256', key)
    .update(`${ref.chatId}/${ref.id}/${expires}`)
    .digest('base64url')

export const attachmentLink = (ref: Ref, mediaType: string) => {
  const expires =
    (Math.floor(Date.now() / 1000 / LINK_WEEK_SECONDS) + 3) * LINK_WEEK_SECONDS
  // OpenRouter takes an image link only when its path ends in an image extension; the AI SDK downloads and inlines any other.
  return `${env.API_URL}/attachments/${ref.chatId}/${ref.id}.${mediaType.split('/')[1]}?expires=${expires}&sig=${signature(signingKey, ref, expires)}`
}

const statOrNull = async (key: string) => {
  try {
    const { size, type } = await bucket.file(key).stat()
    return { key, size, type }
  } catch (error) {
    if (Error.isError(error) && 'code' in error && error.code === 'NoSuchKey') {
      return null
    }
    throw error
  }
}

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
    const document = await getDocumentProxy(new Uint8Array(bytes))
    if (document.numPages > PDF_TEXT.pages) {
      return
    }
    const { text, totalPages } = await extractText(document, {
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
  const image = new Bun.Image(bytes, { maxPixels: MODEL_IMAGE.maxPixels })
  const { height, width } = await image.metadata()
  if (Math.max(height, width) <= MODEL_IMAGE.edge) {
    return
  }
  await bucket.write(
    modelCopyKey(ref),
    await image
      .resize(MODEL_IMAGE.edge, MODEL_IMAGE.edge, { fit: 'inside' })
      .bytes(),
    { type: mediaType }
  )
}

const isOwnTurn = (message: AppUIMessage) =>
  message.role === 'user' && !isSqlRun(message) && !isContinue(message)

/** The file parts sent as files, each with what the model reads for it. Only these are looked up in the bucket. */
const freshFiles = async (messages: AppUIMessage[]) => {
  const candidates = messages
    .filter(isOwnTurn)
    .slice(-FRESH_ATTACHMENTS.turns)
    .toReversed()
    .flatMap((message, age) =>
      message.parts.filter(isFileUIPart).flatMap((part) => {
        const ref = parseAttachmentRef(part.url)
        return ref ? [{ age, part, ref }] : []
      })
    )
  const found = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      file: await modelFile(candidate.ref, candidate.part.mediaType),
    }))
  )
  let bytes = 0
  return new Map(
    found.flatMap(({ age, file, part, ref }) => {
      if (!file || (age > 0 && bytes + file.size > FRESH_ATTACHMENTS.bytes)) {
        return []
      }
      bytes += file.size
      return [[part, { ...file, ref }] as const]
    })
  )
}

const mapParts = async (
  message: AppUIMessage,
  map: (part: AppMessagePart) => Promise<AppMessagePart>
) => ({ ...message, parts: await Promise.all(message.parts.map(map)) })

export const attachments = {
  exists: (ref: Ref) => bucket.file(attachmentKey(ref)).exists(),
  /** Stored files as the chat model is sent them, so only the chat stream and compaction call it: everything else reads the stored transcript, where a file is never the user's words. Fresh files go as a link in production, where a provider can fetch it, and inline elsewhere; a PDF with enough text as that text, framed as data; every other one as a line naming it. */
  forModel: async (messages: AppUIMessage[]) => {
    const fresh = await freshFiles(messages)
    return Promise.all(
      messages.map((message) =>
        mapParts(message, async (part) => {
          if (!isFileUIPart(part) || !parseAttachmentRef(part.url)) {
            return part
          }
          const name = part.filename ?? 'unnamed'
          const file = fresh.get(part)
          if (!file) {
            return {
              text: `[File "${name}", ${part.mediaType}, not sent with this request: ask the user to attach it again if you need it]`,
              type: 'text',
            }
          }
          if (file.isText) {
            return {
              text: `[File "${name}", the text of a PDF]\n${UNTRUSTED_FILE_NOTE}\n${section('FILE', await bucket.file(file.key).text())}`,
              type: 'text',
            }
          }
          if (nodeEnv === 'production') {
            return { ...part, url: attachmentLink(file.ref, part.mediaType) }
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
  /** Whether `attachmentLink` made this link and it has not expired; whether its file is still in the chat is the caller's to check. */
  isSigned: (ref: Ref, expires = '', signed = '') =>
    Number(expires) > Date.now() / 1000 &&
    openingKeys.some((key) =>
      safeEqual(signed, signature(key, ref, Number(expires)))
    ),
  /** What a signed link serves: the copy the model reads in place of the file (never a PDF's text), or null once the file is gone. */
  linked: async (ref: Ref) => {
    const [copy, original] = await Promise.all([
      statOrNull(modelCopyKey(ref)),
      statOrNull(attachmentKey(ref)),
    ])
    const file = original && (copy ?? original)
    return (
      file && { bytes: await bucket.file(file.key).bytes(), type: file.type }
    )
  },
  read: (ref: Ref) => bucket.file(attachmentKey(ref)).bytes(),
  /** Moves the turn's data URLs into the bucket and leaves references in their place, so the transcript every device syncs stays small. The file stays as sent, for the user; a smaller copy for the model goes beside it when one helps. */
  store: async (chatId: string, message: AppUIMessage) => {
    const copies: { bytes: Buffer; mediaType: string; ref: Ref }[] = []
    const stored = await mapParts(message, async (part) => {
      if (part.type !== 'file' || !part.url.startsWith('data:')) {
        return part
      }
      const ref = { chatId, id: v7() }
      const bytes = Buffer.from(
        part.url.slice(part.url.indexOf(',') + 1),
        'base64'
      )
      await bucket.write(attachmentKey(ref), bytes, { type: part.mediaType })
      copies.push({ bytes, mediaType: part.mediaType, ref })
      return { ...part, url: attachmentRef(ref) }
    })
    for (const { bytes, mediaType, ref } of copies) {
      // A file the copy cannot be made from still reaches the model as sent.
      // oxlint-disable-next-line no-await-in-loop -- one copy at a time, so four large files never decode at once
      await silently(() => storeModelCopy(ref, bytes, mediaType))
    }
    return stored
  },
}
