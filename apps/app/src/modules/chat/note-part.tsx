import { NoteIcon } from '@hugeicons/core-free-icons'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { Response } from '@tamery/ui/components/response'

import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart } from './chat-tool-types'
import { getStatus, isRunning } from './tool-status'

type NoteToolPart = Extract<ChatToolPart, { type: 'tool-propose_note' }>

const getTarget = ({ input }: NoteToolPart) =>
  input?.table &&
  (input.column ? `${input.table}.${input.column}` : input.table)

const getVerb = (part: NoteToolPart) => {
  if (part.state !== 'output-available') {
    return 'Proposed'
  }
  return part.output.saved ? 'Saved' : 'Dismissed'
}

export const NotePart = ({
  isLive,
  part,
}: {
  isLive: boolean
  part: NoteToolPart
}) => {
  const running = isRunning(part, isLive)
  const target = getTarget(part)
  const text = part.output?.note ?? part.input?.note
  const verb = running ? 'Saving' : getVerb(part)

  return (
    <ChatDisclosure
      icon={NoteIcon}
      label={
        <>
          {verb} a schema note on{' '}
          {target && running && <span data-mask>{target}</span>}
          {target && !running && <InlineCode data-mask>{target}</InlineCode>}
          {!target && 'this database'}
        </>
      }
      live={running}
      status={!running && getStatus(part, isLive)}
    >
      {text && (
        <div data-mask>
          <Response>{text}</Response>
        </div>
      )}
    </ChatDisclosure>
  )
}
