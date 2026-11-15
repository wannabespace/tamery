import {
  Copy01Icon,
  PencilEdit01Icon,
  RepeatIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@hugeicons/core-free-icons'
import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import { AttachmentGroup } from '@tamery/ui/components/attachment'
import { Bubble, BubbleContent } from '@tamery/ui/components/bubble'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@tamery/ui/components/input-group'
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
import { copy } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { AgentParts, hasContent, showsProgress } from './agent-steps'
import { AttachmentChip } from './attachments'
import type { ToolPartActions } from './chat-tool-types'
import { Clamped } from './clamped'
import { MentionText } from './mention-text'
import type { PromptMention } from './prompt-mentions'
import { usePromptMentions } from './prompt-mentions'
import { PromptMenu } from './prompt-menu'

const MessageFiles = ({ message }: { message: AppUIMessage }) => {
  const files = message.parts.filter((part) => part.type === 'file')
  if (files.length === 0) {
    return null
  }
  return (
    <AttachmentGroup className="max-w-full">
      {files.map((file) => (
        <AttachmentChip key={file.url} orientation="vertical" part={file} />
      ))}
    </AttachmentGroup>
  )
}

const ACTIONS_CLASS =
  'flex items-center gap-0.5 transition-opacity duration-150 focus-within:opacity-100 group-hover/message:opacity-100'

const formatDuration = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const EditMessage = ({
  initial,
  onCancel,
  onSave,
}: {
  initial: string
  onCancel: () => void
  onSave: (text: string, mentions: PromptMention[]) => void
}) => {
  const [value, setValue] = useState(initial)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menu = usePromptMentions({
    commands: false,
    setValue,
    textareaRef,
    value,
  })
  const save = () => {
    if (value.trim()) {
      onSave(value.trim(), menu.sentMentions())
    }
  }
  return (
    <form
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <PromptMenu menu={menu} />
      <InputGroup variant="composer">
        <InputGroupTextarea
          ref={textareaRef}
          autoFocus
          data-mask
          aria-label="Edit message"
          className="field-sizing-content max-h-64 min-h-14 px-3 pt-2.5"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onSelect={(event) => menu.onSelect(event)}
          onFocus={(event) =>
            event.target.setSelectionRange(
              event.target.value.length,
              event.target.value.length
            )
          }
          onKeyDown={(event) => {
            if (menu.onKeyDown(event)) {
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onCancel()
            } else if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              save()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="xs" type="submit" disabled={!value.trim()}>
              Send
            </Button>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

const UserMessage = ({
  message,
  onEdit,
}: {
  message: AppUIMessage
  onEdit?: (text: string, mentions: PromptMention[]) => void
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const text = textFromMessage(message)

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
                      <MentionText message={message} text={text} />
                    </p>
                  </Clamped>
                </BubbleContent>
              </Bubble>
              <div
                className={cn(
                  ACTIONS_CLASS,
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

const AnswerActions = ({
  isLatest,
  message,
  onRegenerate,
}: {
  isLatest: boolean
  message: AppUIMessage
  onRegenerate?: () => void
}) => {
  const { data } = useQuery(
    orpc.ai.models.queryOptions({ staleTime: Infinity })
  )
  const { finishedAt, model, startedAt } = message.metadata ?? {}
  const [rating, setRating] = useState(message.metadata?.rating)
  const modelName = data?.models.find(({ id }) => id === model)?.name
  const rate = (pressed: 'down' | 'up') => {
    const next = pressed === rating ? undefined : pressed
    const { rating: _, ...metadata } = message.metadata ?? {}
    setRating(next)
    posthog.capture('ai_chat_answer_rated', { model, rating: next ?? 'none' })
    void orpc.chatsMessages.update.call({
      id: message.id,
      metadata: next ? { ...metadata, rating: next } : metadata,
    })
  }

  return (
    <div className={cn(ACTIONS_CLASS, '-mt-3 -ml-1', !isLatest && 'opacity-0')}>
      <IconButton
        variant="ghost-muted"
        size="icon-xs"
        icon={Copy01Icon}
        label="Copy answer"
        onClick={() => {
          posthog.capture('ai_chat_message_copied', { role: 'assistant' })
          void copy(textFromMessage(message), 'Copied')
        }}
      />
      {onRegenerate && (
        <IconButton
          variant="ghost-muted"
          size="icon-xs"
          icon={RepeatIcon}
          label="Regenerate"
          onClick={onRegenerate}
        />
      )}
      <IconButton
        variant={rating === 'up' ? 'ghost' : 'ghost-muted'}
        size="icon-xs"
        icon={ThumbsUpIcon}
        label="Good answer"
        aria-pressed={rating === 'up'}
        onClick={() => rate('up')}
      />
      <IconButton
        variant={rating === 'down' ? 'ghost' : 'ghost-muted'}
        size="icon-xs"
        icon={ThumbsDownIcon}
        label="Bad answer"
        aria-pressed={rating === 'down'}
        onClick={() => rate('down')}
      />
      <span className="text-muted-foreground ml-1.5 text-xs">
        {[
          modelName,
          startedAt && finishedAt && formatDuration(finishedAt - startedAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  )
}

const CompactedDivider = () => (
  <div className="text-muted-foreground flex items-center gap-3 text-xs">
    <Separator className="flex-1" />
    Earlier messages summarized
    <Separator className="flex-1" />
  </div>
)

export const ChatMessages = ({
  compactedThroughId,
  decide,
  isPending,
  isWorking,
  messages,
  onEdit,
  onRegenerate,
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
}) => {
  const last = messages.at(-1)
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
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
                    <UserMessage
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
                              ? { decide, isLast: true }
                              : { isLast: false }
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
                    <CompactedDivider />
                  )}
                </MessageScrollerItem>
              )
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton className="absolute inset-x-0 bottom-3 mx-auto" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
