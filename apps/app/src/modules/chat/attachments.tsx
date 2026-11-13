import { Cancel01Icon, Pdf01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import { bytesToBase64 } from '@tamery/shared/base64'
import { fileSize } from '@tamery/shared/files'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@tamery/ui/components/attachment'
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

const base64Bytes = (url: string) =>
  Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4)

export const AttachmentChip = ({
  onRemove,
  part,
}: {
  onRemove?: () => void
  part: FileUIPart
}) => (
  <Attachment size="xs" className="max-w-52">
    <AttachmentMedia
      variant={part.mediaType.startsWith('image/') ? 'image' : 'icon'}
    >
      {part.mediaType.startsWith('image/') ? (
        <img data-mask alt="" src={part.url} />
      ) : (
        <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} />
      )}
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle data-mask>{part.filename}</AttachmentTitle>
      <AttachmentDescription>
        {fileSize(base64Bytes(part.url))}
      </AttachmentDescription>
    </AttachmentContent>
    {onRemove && (
      <AttachmentActions>
        <AttachmentAction aria-label="Remove file" onClick={onRemove}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </AttachmentAction>
      </AttachmentActions>
    )}
  </Attachment>
)
