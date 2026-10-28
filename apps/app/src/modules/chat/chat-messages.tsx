import { AiChat01Icon } from '@hugeicons/core-free-icons'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import { Bubble, BubbleContent } from '@tamery/ui/components/bubble'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { Message, MessageContent } from '@tamery/ui/components/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@tamery/ui/components/message-scroller'
import { Spinner } from '@tamery/ui/components/spinner'
import { cn } from '@tamery/ui/lib/utils'

import { MessagePart } from './chat-message-part'
import type { ToolPartActions } from './chat-tool-part'

const ChatEmpty = () => (
  <IconEmpty
    icon={AiChat01Icon}
    title="Ask Anything"
    description="Query your data, change it, or @ another connection to compare."
  />
)

export const ChatMessages = ({
  className,
  decide,
  isPending,
  messages,
}: {
  /** Layout of the message column, e.g. a centered width on a full page. */
  className?: string
  decide?: ToolPartActions['decide']
  isPending: boolean
  messages: AppUIMessage[]
}) => {
  if (messages.length === 0) {
    return <ChatEmpty />
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
        <MessageScrollerViewport className="px-3">
          <MessageScrollerContent
            role="log"
            aria-label="Chat messages"
            className={cn('gap-4 py-3', className)}
          >
            {messages.map((message) => (
              <MessageScrollerItem key={message.id} messageId={message.id}>
                {message.role === 'user' ? (
                  <Message align="end">
                    <MessageContent>
                      <Bubble align="end" variant="muted">
                        <BubbleContent data-mask>
                          {textFromMessage(message)}
                        </BubbleContent>
                      </Bubble>
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
}
