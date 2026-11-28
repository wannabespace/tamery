import { Cancel01Icon, Pdf01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { parseAttachmentRef } from '@tamery/shared/attachments'
import { fileSize } from '@tamery/shared/files'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@tamery/ui/components/attachment'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { skipToken, useQuery } from '@tanstack/react-query'
import type { FileUIPart } from 'ai'
import { useInView } from 'motion/react'
import type { RefObject } from 'react'
import { useRef, useState } from 'react'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

const FETCH_STATE = {
  error: 'error',
  pending: 'processing',
  success: 'done',
} as const

const base64Bytes = (url: string) =>
  Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4)

const useFile = (url: string, chip: RefObject<HTMLDivElement | null>) => {
  const ref = parseAttachmentRef(url)
  const isInView = useInView(chip, { once: true })
  const { data, status } = useQuery({
    // An object URL is never revoked, so the query must outlive every chip showing it.
    gcTime: Infinity,
    queryFn:
      ref && isInView
        ? async () => {
            const blob = await orpc.ai.attachment.call(ref)
            return { size: blob.size, url: URL.createObjectURL(blob) }
          }
        : skipToken,
    queryKey: ['chat-attachment', url],
    staleTime: Infinity,
    throwOnError: false,
  })
  return { file: ref ? data : { size: base64Bytes(url), url }, status }
}

export const AttachmentChip = ({
  onRemove,
  orientation = 'horizontal',
  part,
}: {
  onRemove?: () => void
  orientation?: 'horizontal' | 'vertical'
  part: FileUIPart
}) => {
  const [isViewing, setIsViewing] = useState(false)
  const chip = useRef<HTMLDivElement>(null)
  const { file, status } = useFile(part.url, chip)
  const isImage = part.mediaType.startsWith('image/')
  const open = () => {
    posthog.capture('ai_chat_attachment_opened', {
      kind: isImage ? 'image' : 'pdf',
    })
    if (isImage) {
      setIsViewing(true)
      return
    }
    if (!file) {
      return
    }
    // The desktop app refuses new windows, so a PDF is saved rather than shown.
    const link = document.createElement('a')
    link.href = file.url
    link.download = part.filename ?? 'attachment.pdf'
    link.click()
  }

  return (
    <Attachment
      ref={chip}
      state={file ? 'done' : FETCH_STATE[status]}
      orientation={orientation}
      size={orientation === 'vertical' ? 'default' : 'xs'}
      className="max-w-52"
    >
      <AttachmentMedia variant={isImage ? 'image' : 'icon'}>
        {isImage ? (
          <img data-mask alt="" src={file?.url} />
        ) : (
          <HugeiconsIcon icon={Pdf01Icon} strokeWidth={2} />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle data-mask>{part.filename}</AttachmentTitle>
        <AttachmentDescription>
          {file ? fileSize(file.size) : status === 'error' && "Couldn't load"}
        </AttachmentDescription>
      </AttachmentContent>
      {onRemove ? (
        <AttachmentActions>
          <AttachmentAction aria-label="Remove file" onClick={onRemove}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </AttachmentAction>
        </AttachmentActions>
      ) : (
        <AttachmentTrigger
          aria-label={`Open ${part.filename ?? 'file'}`}
          onClick={open}
        />
      )}
      {isImage && (
        <Dialog open={isViewing} onOpenChange={setIsViewing} variant="panel">
          <DialogContent>
            <DialogTitle className="sr-only">{part.filename}</DialogTitle>
            <img
              data-mask
              alt={part.filename ?? ''}
              src={file?.url}
              className="size-full object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </Attachment>
  )
}
