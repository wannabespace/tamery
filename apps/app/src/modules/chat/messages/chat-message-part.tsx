import { BrainIcon } from '@hugeicons/core-free-icons'
import type { AppMessagePart } from '@tamery/ai/message'
import { Response } from '@tamery/ui/components/response'
import { isStaticToolUIPart } from 'ai'

import { ToolPart } from '../tools/chat-tool-part'
import type { ToolPartActions } from '../tools/chat-tool-types'
import { ChatDisclosure } from './chat-disclosure'
import { MODEL_DISALLOWED_ELEMENTS } from './model-elements'
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
        <Response {...slots} disallowedElements={MODEL_DISALLOWED_ELEMENTS}>
          {part.text}
        </Response>
      ) : null
    }
    case 'reasoning': {
      return part.text.trim() ? (
        <ChatDisclosure icon={BrainIcon} label="Thinking">
          <div className="text-muted-foreground">
            <Response disallowedElements={MODEL_DISALLOWED_ELEMENTS}>
              {part.text}
            </Response>
          </div>
        </ChatDisclosure>
      ) : null
    }
    default: {
      return null
    }
  }
}
