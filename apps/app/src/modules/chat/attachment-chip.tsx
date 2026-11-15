import { Cancel01Icon, Pdf01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
import type { FileUIPart } from 'ai'
import { useState } from 'react'

import { posthog } from '~/lib/posthog'

const base64Bytes = (url: string) =>
  Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4)

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
  const isImage = part.mediaType.startsWith('image/')
  const open = () => {
    posthog.capture('ai_chat_attachment_opened', {
      kind: isImage ? 'image' : 'pdf',
    })
    if (isImage) {
      setIsViewing(true)
      return
    }
    // The desktop app refuses new windows, so a PDF is saved rather than shown.
    const link = document.createElement('a')
    link.href = part.url
    link.download = part.filename ?? 'attachment.pdf'
    link.click()
  }

  return (
    <Attachment
      orientation={orientation}
      size={orientation === 'vertical' ? 'default' : 'xs'}
      className="max-w-52"
    >
      <AttachmentMedia variant={isImage ? 'image' : 'icon'}>
        {isImage ? (
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
              src={part.url}
              className="size-full object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </Attachment>
  )
}
