import { textFromMessage } from '@tamery/ai/message'
import { copy } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { posthog } from '~/lib/posthog'

import { ChatError } from './chat-error'
import { ChatInput } from './chat-input'
import { ChatIntro, ChatStarters } from './chat-intro'
import { ChatMessages } from './chat-messages'
import { ChatPaused } from './chat-paused'
import type { ChatCommand } from './prompt-mentions'
import { approvalModeValue, modelPickerOpenStore } from './stores'
import type { ChatSession } from './use-chat-session'

const COMPOSER_TRANSITION = { duration: 0.3, ease: [0.32, 0.72, 0, 1] } as const

export const ChatConversation = ({
  beforeInput,
  canReply = true,
  isActive,
  onNewChat,
  session,
}: {
  beforeInput?: ReactNode
  /** False for a subagent's chat: it answers its parent, so the user reads and approves but never writes to it. */
  canReply?: boolean
  isActive: boolean
  onNewChat: () => void
  session: ChatSession
}) => {
  const lastAnswer = session.messages.findLast(
    (message) => message.role === 'assistant'
  )
  const commands: Record<ChatCommand, () => void> = {
    ask: () => approvalModeValue.set('ask'),
    auto: () => approvalModeValue.set('auto'),
    copy: () => {
      if (lastAnswer) {
        void copy(textFromMessage(lastAnswer), 'Copied')
      }
    },
    model: () => modelPickerOpenStore.set(true),
    new: onNewChat,
    retry: () => session.retry(),
  }

  const isEmpty = session.messages.length === 0

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        isEmpty && 'justify-center-safe overflow-y-auto'
      )}
    >
      {isEmpty ? (
        <ChatIntro />
      ) : (
        <ChatMessages
          decide={session.isReady ? session.decide : undefined}
          isPending={session.isStreaming}
          messages={session.messages}
        />
      )}
      {session.error && (
        <ChatError error={session.error} onRetry={() => session.retry()} />
      )}
      {session.isPaused && <ChatPaused onContinue={() => session.resume()} />}
      {beforeInput}
      {canReply ? (
        // One element in both layouts, so the composer keeps its draft and focus while it glides from the middle to the bottom.
        <motion.div layout="position" transition={COMPOSER_TRANSITION}>
          <ChatInput
            isActive={isActive}
            isStreaming={session.isStreaming}
            onCommand={(command) => {
              posthog.capture('ai_chat_command', { command })
              commands[command]()
            }}
            onSend={(text, mentions, files) => {
              void session.send(text, mentions, files)
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
  )
}
