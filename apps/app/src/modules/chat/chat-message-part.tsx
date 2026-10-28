import { BrainIcon } from '@hugeicons/core-free-icons'
import type { AppMessagePart } from '@tamery/ai/message'
import { Response } from '@tamery/ui/components/response'
import { isStaticToolUIPart } from 'ai'

import { ChatDisclosure } from './chat-disclosure'
import { ToolPart } from './chat-tool-part'
import type { ToolPartActions } from './chat-tool-types'

export const MessagePart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: AppMessagePart
}) => {
  if (isStaticToolUIPart(part)) {
    return <ToolPart actions={actions} part={part} />
  }

  switch (part.type) {
    case 'text': {
      return part.text.trim() ? <Response>{part.text}</Response> : null
    }
    case 'reasoning': {
      return part.text.trim() ? (
        <ChatDisclosure icon={BrainIcon} label="Reasoning">
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
