import { BrainIcon } from '@hugeicons/core-free-icons'
import type { AppMessagePart } from '@tamery/ai/message'
import { Response } from '@tamery/ui/components/response'
import { isStaticToolUIPart } from 'ai'

import { ChatDisclosure } from './chat-disclosure'
import { ToolPart } from './chat-tool-part'
import type { ToolPartActions } from './chat-tool-types'
import { useResponseSlots } from './response-slots'

export const MessagePart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: AppMessagePart
}) => {
  const slots = useResponseSlots()
  if (isStaticToolUIPart(part)) {
    return <ToolPart actions={actions} part={part} />
  }

  switch (part.type) {
    case 'text': {
      return part.text.trim() ? (
        <Response {...slots}>{part.text}</Response>
      ) : null
    }
    case 'reasoning': {
      return part.text.trim() ? (
        <ChatDisclosure icon={BrainIcon} label="Thinking">
          <div className="text-muted-foreground">
            <Response>{part.text}</Response>
          </div>
        </ChatDisclosure>
      ) : null
    }
    default: {
      return null
    }
  }
}
