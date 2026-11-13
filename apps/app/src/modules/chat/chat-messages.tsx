import { Copy01Icon } from '@hugeicons/core-free-icons'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import { AttachmentGroup } from '@tamery/ui/components/attachment'
import { Bubble, BubbleContent } from '@tamery/ui/components/bubble'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  Message,
  MessageContent,
  MessageFooter,
} from '@tamery/ui/components/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@tamery/ui/components/message-scroller'
import { Spinner } from '@tamery/ui/components/spinner'
import { copy } from '@tamery/ui/lib/copy'

import { posthog } from '~/lib/posthog'

import { AttachmentChip } from './attachments'
import { MessagePart } from './chat-message-part'
import type { ToolPartActions } from './chat-tool-types'

const MessageFiles = ({ message }: { message: AppUIMessage }) => {
  const files = message.parts.filter((part) => part.type === 'file')
  if (files.length === 0) {
    return null
  }
  return (
    <AttachmentGroup className="max-w-full">
      {files.map((file) => (
        <AttachmentChip key={file.url} part={file} />
      ))}
    </AttachmentGroup>
  )
}

export const ChatMessages = ({
  decide,
  isPending,
  messages,
}: {
  decide?: ToolPartActions['decide']
  isPending: boolean
  messages: AppUIMessage[]
}) => (
  <MessageScrollerProvider autoScroll>
    <MessageScroller>
      <MessageScrollerViewport className="px-3">
        <MessageScrollerContent
          role="log"
          aria-label="Chat messages"
          className="gap-4 py-3"
        >
          {messages.map((message) => (
            <MessageScrollerItem key={message.id} messageId={message.id}>
              {message.role === 'user' ? (
                <Message align="end">
                  <MessageContent className="items-end">
                    <MessageFiles message={message} />
                    {textFromMessage(message) && (
                      <Bubble align="end" variant="muted">
                        <BubbleContent data-mask>
                          {textFromMessage(message)}
                        </BubbleContent>
                      </Bubble>
                    )}
                  </MessageContent>
                </Message>
              ) : (
                <Message>
                  <MessageContent data-mask>
                    {message.parts.map((part, index) => (
                      <MessagePart
                        key={index}
                        part={part}
                        actions={
                          message === messages.at(-1)
                            ? { decide, isLast: true }
                            : { isLast: false }
                        }
                      />
                    ))}
                  </MessageContent>
                  {!(isPending && message === messages.at(-1)) &&
                    textFromMessage(message) && (
                      <MessageFooter>
                        <IconButton
                          variant="ghost-muted"
                          size="icon-xs"
                          icon={Copy01Icon}
                          label="Copy answer"
                          onClick={() => {
                            posthog.capture('ai_chat_message_copied')
                            void copy(textFromMessage(message), 'Copied')
                          }}
                        />
                      </MessageFooter>
                    )}
                </Message>
              )}
              {isPending && message === messages.at(-1) && (
                <Message className="mt-2.5">
                  <MessageContent>
                    <Spinner className="text-muted-foreground size-4" />
                  </MessageContent>
                </Message>
              )}
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton className="absolute inset-x-0 bottom-3 mx-auto" />
    </MessageScroller>
  </MessageScrollerProvider>
)
