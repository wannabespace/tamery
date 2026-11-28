import type { AppUIMessage } from '@tamery/ai/message'
import { AttachmentGroup } from '@tamery/ui/components/attachment'

import { AttachmentChip } from './attachment-chip'

export const MessageFiles = ({ message }: { message: AppUIMessage }) => {
  const files = message.parts.filter((part) => part.type === 'file')
  if (files.length === 0) {
    return null
  }
  return (
    <AttachmentGroup className="max-w-full">
      {files.map((file) => (
        <AttachmentChip key={file.url} orientation="vertical" part={file} />
      ))}
    </AttachmentGroup>
  )
}
