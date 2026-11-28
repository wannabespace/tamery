import { Copy01Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import { Bubble, BubbleContent } from '@tamery/ui/components/bubble'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { Message, MessageContent } from '@tamery/ui/components/message'
import { copy } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { useState } from 'react'

import { posthog } from '~/lib/posthog'

import { MentionText } from '../mentions/mention-text'
import type { PromptMention } from '../mentions/prompt-mentions'
import { Clamped } from './clamped'
import { EditMessage } from './edit-message'
import { MESSAGE_ACTIONS_CLASS } from './message-actions'
import { MessageFiles } from './message-files'

export const UserMessage = ({
  message,
  onEdit,
}: {
  message: AppUIMessage
  onEdit?: (text: string, mentions: PromptMention[]) => void
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const text = textFromMessage(message)
  // An edit goes out only after its new mentions are described, so the bubble shows the new text until the message carries it.
  const [sentText, setSentText] = useState<string | null>(null)
  if (sentText !== null && sentText === text) {
    setSentText(null)
  }

  return (
    <Message align="end">
      <MessageContent className="relative items-end">
        <MessageFiles message={message} />
        {isEditing && onEdit ? (
          <EditMessage
            initial={text}
            onCancel={() => setIsEditing(false)}
            onSave={(next, mentions) => {
              setIsEditing(false)
              setSentText(next)
              onEdit(next, mentions)
            }}
          />
        ) : (
          text && (
            <>
              <Bubble align="end" variant="muted">
                <BubbleContent data-mask>
                  <Clamped>
                    <p className="whitespace-pre-wrap">
                      {sentText ?? (
                        <MentionText message={message} text={text} />
                      )}
                    </p>
                  </Clamped>
                </BubbleContent>
              </Bubble>
              <div
                className={cn(
                  MESSAGE_ACTIONS_CLASS,
                  'absolute top-full -right-1 mt-0.5 opacity-0'
                )}
              >
                <IconButton
                  variant="ghost-muted"
                  size="icon-xs"
                  icon={Copy01Icon}
                  label="Copy message"
                  onClick={() => {
                    posthog.capture('ai_chat_message_copied', { role: 'user' })
                    void copy(text, 'Copied')
                  }}
                />
                {onEdit && (
                  <IconButton
                    variant="ghost-muted"
                    size="icon-xs"
                    icon={PencilEdit01Icon}
                    label="Edit message"
                    onClick={() => setIsEditing(true)}
                  />
                )}
              </div>
            </>
          )
        )}
      </MessageContent>
    </Message>
  )
}
