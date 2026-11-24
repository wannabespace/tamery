import { CheckListIcon } from '@hugeicons/core-free-icons'
import type { AppMessagePart } from '@tamery/ai/message'
import { isStaticToolUIPart, isToolUIPart } from 'ai'

import { ChatDisclosure } from './chat-disclosure'
import { MessagePart } from './chat-message-part'
import { getLiveLabel, hasLabel } from './chat-tool-part'
import type { ToolPartActions } from './chat-tool-types'
import { isSkipped } from './tool-status'

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
    case 'tool-ask_user':
    case 'tool-combine':
    case 'tool-execute':
    case 'tool-propose_note':
    case 'tool-query':
    case 'tool-spawn_agent': {
      return false
    }
    default: {
      return true
    }
  }
}

const isVisible = (part: AppMessagePart) =>
  part.type === 'text' || part.type === 'reasoning'
    ? !!part.text.trim()
    : isStaticToolUIPart(part) && (!isLegwork(part) || hasLabel(part.type))

/** A turn interrupted before it wrote or ran anything has nothing to show. */
export const hasContent = (parts: AppMessagePart[]) => parts.some(isVisible)

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

/** The live fold names the step in flight, or Thinking between steps. */
const currentStep = (parts: AppMessagePart[]) => {
  const last = parts.at(-1)
  return last &&
    isStaticToolUIPart(last) &&
    last.state !== 'output-available' &&
    last.state !== 'output-error'
    ? getLiveLabel(last)
    : 'Thinking'
}

const isText = (segment: Segment) =>
  segment.kind === 'part' && segment.part.type === 'text'

/** Tool work that follows tool work sits close as one block, step lines closer still; text keeps the answer's wider rhythm around it. */
const toBlocks = (segments: Segment[]) => {
  const blocks: { prose: boolean; segments: Segment[]; start: number }[] = []
  for (const [index, segment] of segments.entries()) {
    const last = blocks.at(-1)
    if (last && !last.prose && !isText(segment)) {
      last.segments.push(segment)
    } else {
      blocks.push({ prose: isText(segment), segments: [segment], start: index })
    }
  }
  return blocks
}

const isSkippedChange = (part: AppMessagePart) =>
  isStaticToolUIPart(part) && part.type === 'tool-execute' && isSkipped(part)

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
  const answer = toSegments(parts.filter((part) => !isSkippedChange(part)))
  // Skipped changes sit under the answer, where `chat-step.ts` tells the agent their cards are.
  const segments: Segment[] = [
    ...answer,
    ...parts
      .filter(isSkippedChange)
      .map((part) => ({ kind: 'part' as const, part })),
  ]
  const render = (segment: Segment, index: number) => {
    if (segment.kind === 'part') {
      return <MessagePart key={index} actions={actions} part={segment.part} />
    }
    const isLive = isWorking && index === answer.length - 1
    const [only] = segment.parts
    if (segment.parts.length === 1 && only && !isLive) {
      return <MessagePart key={index} actions={actions} part={only} />
    }
    return (
      <ChatDisclosure
        key={index}
        icon={CheckListIcon}
        label={
          isLive ? currentStep(segment.parts) : plural(segment.parts.length)
        }
        live={isLive}
      >
        <div className="flex flex-col gap-1.5">
          {segment.parts.map((part, partIndex) => (
            <MessagePart key={partIndex} actions={actions} part={part} />
          ))}
        </div>
      </ChatDisclosure>
    )
  }
  return toBlocks(segments).map(({ prose, start, segments: run }) =>
    prose ? (
      run.map((segment, offset) => render(segment, start + offset))
    ) : (
      <div
        key={start}
        className="flex flex-col gap-3 [&>[data-slot=chat-step]+[data-slot=chat-step]]:-mt-1.5"
      >
        {run.map((segment, offset) => render(segment, start + offset))}
      </div>
    )
  )
}

/** The live answer's last part already shows that work goes on: text being written, the Working fold, or a tool still running or waiting. */
export const showsProgress = (parts: AppMessagePart[]) => {
  const last = toSegments(parts).at(-1)
  if (!last || last.kind === 'steps') {
    return !!last
  }
  const { part } = last
  return (
    part.type === 'text' ||
    (isToolUIPart(part) &&
      part.state !== 'output-available' &&
      part.state !== 'output-error')
  )
}
