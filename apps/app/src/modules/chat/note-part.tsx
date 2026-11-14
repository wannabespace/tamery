import { NoteIcon } from '@hugeicons/core-free-icons'
import { Response } from '@tamery/ui/components/response'

import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { NoteProposal, NoteTitle } from './note-proposal'
import { getStatus } from './tool-status'

const verb = (part: Extract<ChatToolPart, { type: 'tool-propose_note' }>) => {
  if (part.state !== 'output-available') {
    return 'Proposed'
  }
  return part.output.saved ? 'Saved' : 'Dismissed'
}

export const NotePart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: Extract<ChatToolPart, { type: 'tool-propose_note' }>
}) => {
  if (part.state === 'input-available' && actions.decide) {
    return (
      <NoteProposal
        decideNote={actions.decide.note}
        input={part.input}
        toolCallId={part.toolCallId}
      />
    )
  }

  return (
    <ChatDisclosure
      icon={NoteIcon}
      label={
        <NoteTitle input={part.input} prefix={`${verb(part)} a schema note`} />
      }
      status={getStatus(part, actions.isLast)}
    >
      <Response>{part.output?.note ?? part.input?.note ?? ''}</Response>
    </ChatDisclosure>
  )
}
