import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import { Message, MessageContent } from '@tamery/ui/components/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@tamery/ui/components/message-scroller'
import { Separator } from '@tamery/ui/components/separator'
import { useRef } from 'react'

import { AgentParts, hasContent, showsProgress } from './agent-steps'
import { AnswerActions } from './answer-actions'
import type { ToolPartActions } from './chat-tool-types'
import type { PromptMention } from './prompt-mentions'
import { sqlRuns } from './sql-run'
import { SqlRunCard } from './statement-part'
import { TurnRail } from './turn-rail'
import { UserMessage } from './user-message'

const UserTurn = ({
  message,
  onEdit,
}: {
  message: AppUIMessage
  onEdit?: (text: string, mentions: PromptMention[]) => void
}) => {
  const [run] = sqlRuns(message)
  return run ? (
    <SqlRunCard data={run} />
  ) : (
    <UserMessage message={message} onEdit={onEdit} />
  )
}

export const ChatMessages = ({
  compactedThroughId,
  decide,
  isPending,
  isWorking,
  messages,
  onEdit,
  onRegenerate,
  runSkipped,
}: {
  /** The last message the model now reads only as a summary. */
  compactedThroughId?: string
  decide?: ToolPartActions['decide']
  /** The request is in flight: the first-token wait under a just-sent message. */
  isPending: boolean
  isWorking: boolean
  messages: AppUIMessage[]
  /** Unset while the chat cannot take a new message, such as a subagent's. */
  onEdit?: (messageId: string, text: string, mentions: PromptMention[]) => void
  onRegenerate?: () => void
  runSkipped: NonNullable<ToolPartActions['skipped']>['run']
}) => {
  const transcriptRef = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)
  // A change runs as the user's message, so only where `onEdit` says the chat takes one.
  const skipped = onEdit && {
    ran: new Set(
      messages.flatMap((message) =>
        sqlRuns(message).flatMap(({ toolCallId }) =>
          toolCallId ? [toolCallId] : []
        )
      )
    ),
    run: runSkipped,
  }
  return (
    // Without the zero peek, visibility ignores the top 64px, where a jump lands: the turn rail would not see a short turn there and repeat the jump.
    <MessageScrollerProvider autoScroll scrollPreviousItemPeek={0}>
      <MessageScroller ref={transcriptRef}>
        <MessageScrollerViewport>
          <MessageScrollerContent
            role="log"
            aria-label="Chat messages"
            // The kit lint wants a static string here: keep in sync with CHAT_COLUMN.
            className="mx-auto w-full max-w-2xl gap-6 p-3"
          >
            {messages.map((message) =>
              message.role === 'assistant' &&
              !(isWorking && message === last) &&
              !hasContent(message.parts) ? null : (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  {message.role === 'user' ? (
                    <UserTurn
                      message={message}
                      onEdit={
                        onEdit && !isWorking
                          ? (text, mentions) =>
                              onEdit(message.id, text, mentions)
                          : undefined
                      }
                    />
                  ) : (
                    <Message>
                      <MessageContent data-mask>
                        <AgentParts
                          isWorking={isWorking && message === last}
                          parts={message.parts}
                          actions={
                            message === last
                              ? { decide, isLive: isWorking, skipped }
                              : { isLive: false, skipped }
                          }
                        />
                        {isWorking && message === last ? (
                          <div className="flex h-6 items-center">
                            {!showsProgress(message.parts) && (
                              <span className="text-muted-foreground shimmer text-xs">
                                Thinking
                              </span>
                            )}
                          </div>
                        ) : (
                          textFromMessage(message) && (
                            <AnswerActions
                              isLatest={message === last}
                              message={message}
                              onRegenerate={
                                message === last ? onRegenerate : undefined
                              }
                            />
                          )
                        )}
                      </MessageContent>
                    </Message>
                  )}
                  {isPending && message === last && message.role === 'user' && (
                    <Message className="mt-2.5">
                      <MessageContent>
                        <span className="text-muted-foreground shimmer flex h-6 items-center text-xs">
                          Thinking
                        </span>
                      </MessageContent>
                    </Message>
                  )}
                  {message.id === compactedThroughId && message !== last && (
                    <div className="text-muted-foreground flex items-center gap-3 text-xs">
                      <Separator className="flex-1" />
                      Earlier messages summarized
                      <Separator className="flex-1" />
                    </div>
                  )}
                </MessageScrollerItem>
              )
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton className="absolute inset-x-0 bottom-3 mx-auto" />
        <TurnRail messages={messages} transcript={transcriptRef} />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
