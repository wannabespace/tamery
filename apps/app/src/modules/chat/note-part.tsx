import { NoteIcon } from '@hugeicons/core-free-icons'
import { Response } from '@tamery/ui/components/response'

import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { NoteProposal } from './note-proposal'
import { getStatus } from './tool-status'

export const NotePart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: Extract<ChatToolPart, { type: 'tool-propose_note' }>
}) => {
  const awaitsDecision = part.state === 'input-available' && !!actions.decide

  return (
    <div className="flex flex-col gap-2">
      <ChatDisclosure
        icon={NoteIcon}
        label={part.output?.saved ? 'Saved a note' : 'Proposed a note'}
        status={
          awaitsDecision ? (
            <span className="text-warning">Needs review</span>
          ) : (
            getStatus(part, actions.isLast)
          )
        }
      >
        <Response>{part.output?.note ?? part.input?.note ?? ''}</Response>
      </ChatDisclosure>
      {awaitsDecision && actions.decide && (
        <NoteProposal
          decideNote={actions.decide.note}
          input={part.input}
          toolCallId={part.toolCallId}
        />
      )}
    </div>
  )
}
