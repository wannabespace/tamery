import { CHAT_LIMITS } from '@tamery/ai/limits'
import { bytesToBase64 } from '@tamery/shared/base64'
import type { FileUIPart } from 'ai'
import { toast } from 'sonner'

export const ATTACHMENT_ACCEPT = [...CHAT_LIMITS.attachmentTypes].join(',')

const toPart = async (file: File): Promise<FileUIPart> => ({
  filename: file.name,
  mediaType: file.type,
  type: 'file',
  url: `data:${file.type};base64,${bytesToBase64(new Uint8Array(await file.arrayBuffer()))}`,
})

/** Reads the files the API takes into message parts, at most as many as still fit beside `attached`, and says why the rest stay out. */
export const readAttachments = (files: File[], attached: number) => {
  const fitting = files.filter(
    (file) =>
      CHAT_LIMITS.attachmentTypes.has(file.type) &&
      file.size <= CHAT_LIMITS.attachmentBytes
  )
  if (fitting.length < files.length) {
    toast.error('Only images and PDFs up to 5 MB can be attached')
  }
  const room = CHAT_LIMITS.attachments - attached
  if (fitting.length > room) {
    toast.error(`A message takes up to ${CHAT_LIMITS.attachments} files`)
  }
  return Promise.all(fitting.slice(0, Math.max(0, room)).map(toPart))
}
