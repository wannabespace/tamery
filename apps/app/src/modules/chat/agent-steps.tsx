import { CheckListIcon } from '@hugeicons/core-free-icons'
import type { AppMessagePart } from '@tamery/ai/message'
import { Spinner } from '@tamery/ui/components/spinner'
import { isStaticToolUIPart } from 'ai'

import { ChatDisclosure } from './chat-disclosure'
import { MessagePart } from './chat-message-part'
import type { ToolPartActions } from './chat-tool-types'

type Segment =
  | { kind: 'part'; part: AppMessagePart }
  | { kind: 'steps'; parts: AppMessagePart[] }

const isLegwork = (part: AppMessagePart) => {
  if (part.type === 'reasoning') {
    return true
  }
  if (!isStaticToolUIPart(part)) {
    return false
  }
  switch (part.type) {
    case 'tool-execute':
    case 'tool-propose_note':
    case 'tool-spawn_agent': {
      return false
    }
    case 'tool-combine':
    case 'tool-propose_change':
    case 'tool-query': {
      return part.state !== 'output-available'
    }
    default: {
      return true
    }
  }
}

const isVisible = (part: AppMessagePart) =>
  part.type === 'text' || part.type === 'reasoning'
    ? !!part.text.trim()
    : isStaticToolUIPart(part)

const toSegments = (parts: AppMessagePart[]) => {
  const segments: Segment[] = []
  for (const part of parts.filter(isVisible)) {
    const last = segments.at(-1)
    if (!isLegwork(part)) {
      segments.push({ kind: 'part', part })
    } else if (last?.kind === 'steps') {
      last.parts.push(part)
    } else {
      segments.push({ kind: 'steps', parts: [part] })
    }
  }
  return segments
}

const plural = (count: number) => (count === 1 ? '1 step' : `${count} steps`)

export const AgentParts = ({
  actions,
  isWorking,
  parts,
}: {
  actions: ToolPartActions
  /** The answer is still being written: its last run of steps is live. */
  isWorking: boolean
  parts: AppMessagePart[]
}) => {
  const segments = toSegments(parts)
  return segments.map((segment, index) => {
    if (segment.kind === 'part') {
      return <MessagePart key={index} actions={actions} part={segment.part} />
    }
    const [only] = segment.parts
    if (segment.parts.length === 1 && only) {
      return <MessagePart key={index} actions={actions} part={only} />
    }
    const isLive = isWorking && index === segments.length - 1
    return (
      <ChatDisclosure
        key={index}
        icon={CheckListIcon}
        label={isLive ? 'Working' : plural(segment.parts.length)}
        status={isLive && <Spinner className="size-3" />}
      >
        <div className="flex flex-col gap-1.5">
          {segment.parts.map((part, partIndex) => (
            <MessagePart key={partIndex} actions={actions} part={part} />
          ))}
        </div>
      </ChatDisclosure>
    )
  })
}
