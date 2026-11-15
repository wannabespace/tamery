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
} from '@tamery/ui/components/attachment'
import type { FileUIPart } from 'ai'

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
