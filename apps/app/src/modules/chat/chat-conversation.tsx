import {
  ArrowUp02Icon,
  Cancel01Icon,
  Clock01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { textFromMessage } from '@tamery/ai/message'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
} from '@tamery/ui/components/item'
import { copy } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

import { CHAT_COLUMN } from './chat-column'
import { ChatError } from './chat-error'
import { ChatInput } from './chat-input'
import { ChatMessages } from './chat-messages'
import { ChatPaused } from './chat-paused'
import { ChatStarters } from './chat-starters'
import {
  CHAT_EMPTY_LAYOUT,
  CHAT_LAYOUT,
  ChatIntroHeading,
} from './composer-stand-in'
import { ContextMeter } from './context-meter'
import type { ChatCommand } from './slash-commands'
import { modelPickerOpenStore } from './stores'
import type { ChatSession } from './use-chat-session'

const COMPOSER_TRANSITION = { duration: 0.3, ease: [0.32, 0.72, 0, 1] } as const

export const ChatConversation = ({
  beforeInput,
  canInterrupt = true,
  canReply = true,
  isActive,
  onNewChat,
  session,
}: {
  beforeInput?: ReactNode
  /** False for a subagent: what the user writes waits for its turn instead of stopping it. */
  canInterrupt?: boolean
  /** False for a finished subagent's chat: it answered its parent, so the user only reads it. */
  canReply?: boolean
  isActive: boolean
  onNewChat: () => void
  session: ChatSession
}) => {
  const lastAnswer = session.messages.findLast(
    (message) => message.role === 'assistant'
  )
  const lastAsked = session.messages.findLast(
    (message) => message.role === 'user'
  )
  const commands: Record<ChatCommand, () => void> = {
    compact: () => {
      toast.promise(orpc.ai.compact.call({ chatId: session.chatId }), {
        loading: 'Compacting the chat…',
        success: 'Chat compacted',
      })
    },
    copy: () => {
      if (lastAnswer) {
        void copy(textFromMessage(lastAnswer), 'Copied')
      } else {
        toast('There is no answer to copy yet')
      }
    },
    model: () => modelPickerOpenStore.set(true),
    new: onNewChat,
    retry: () => {
      if (lastAsked) {
        session.retry()
      } else {
        toast('There is no message to ask again yet')
      }
    },
  }

  const isEmpty = session.messages.length === 0

  return (
    <div
      data-slot="chat-conversation"
      className={cn(CHAT_LAYOUT, isEmpty && CHAT_EMPTY_LAYOUT)}
    >
      {isEmpty ? (
        <ChatIntroHeading />
      ) : (
        <ChatMessages
          compactedThroughId={session.compaction?.throughMessageId}
          decide={session.isReady ? session.decide : undefined}
          isPending={session.isStreaming}
          isWorking={session.isWorking}
          messages={session.messages}
          onEdit={
            canReply
              ? (messageId, text, mentions) => {
                  void session.edit(messageId, text, mentions)
                }
              : undefined
          }
          onRegenerate={
            canReply && !session.isWorking ? () => session.retry() : undefined
          }
          runSkipped={session.runSkipped}
        />
      )}
      <div className={cn(CHAT_COLUMN, 'flex shrink-0 flex-col')}>
        {session.error && (
          <ChatError error={session.error} onRetry={() => session.retry()} />
        )}
        {session.pausedBy && (
          <ChatPaused
            by={session.pausedBy}
            onContinue={() => session.resume()}
          />
        )}
        {beforeInput}
        {session.queue.length > 0 && (
          <ItemGroup className="mx-3 mt-2 w-auto">
            {session.queue.map((queued) => (
              <Item key={queued.id} variant="muted" size="2xs">
                <ItemMedia variant="icon">
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    strokeWidth={2}
                    className="text-muted-foreground size-3.5"
                  />
                </ItemMedia>
                <ItemContent>
                  <span data-mask className="text-muted-foreground truncate">
                    {queued.text || `${queued.files.length} files`}
                  </span>
                </ItemContent>
                <ItemActions>
                  {canInterrupt && (
                    <IconButton
                      variant="ghost-muted"
                      size="icon-xs"
                      icon={ArrowUp02Icon}
                      label="Send now"
                      onClick={() => {
                        session.removeQueued(queued.id)
                        void session.send(
                          queued.text,
                          queued.mentions,
                          queued.files,
                          true
                        )
                      }}
                    />
                  )}
                  <IconButton
                    variant="ghost-muted"
                    size="icon-xs"
                    icon={Cancel01Icon}
                    label="Remove from queue"
                    onClick={() => session.removeQueued(queued.id)}
                  />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        {canReply ? (
          // One element in both layouts, so the composer keeps its draft and focus while it glides from the middle to the bottom.
          <motion.div layout="position" transition={COMPOSER_TRANSITION}>
            <ChatInput
              key={session.chatId}
              canInterrupt={canInterrupt}
              chatId={session.chatId}
              isActive={isActive}
              isWorking={session.isWorking}
              lastPrompt={lastAsked ? textFromMessage(lastAsked) : undefined}
              suggestion={
                session.messages.at(-1) === lastAnswer
                  ? lastAnswer?.metadata?.suggestion
                  : undefined
              }
              meter={
                <ContextMeter
                  chatId={session.chatId}
                  isWorking={session.isWorking}
                  messages={session.messages}
                />
              }
              onCommand={(command) => {
                posthog.capture('ai_chat_command', { command })
                commands[command]()
              }}
              onSend={(text, mentions, files, now) => {
                void session.send(text, mentions, files, now)
              }}
              onStop={() => session.stop()}
            />
          </motion.div>
        ) : (
          <p className="text-muted-foreground shrink-0 px-3 py-2 text-xs">
            This subagent reports to the chat that started it.
          </p>
        )}
        {isEmpty && canReply && (
          <ChatStarters
            onStart={(prompt) => {
              void session.send(prompt, [])
            }}
          />
        )}
      </div>
    </div>
  )
}
