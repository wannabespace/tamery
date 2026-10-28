import { cn } from '@tamery/ui/lib/utils'

import { ChatError } from './chat-error'
import { ChatInput } from './chat-input'
import { ChatMessages } from './chat-messages'
import { ChatPaused } from './chat-paused'
import type { ChatSession } from './use-chat-session'

export const ChatConversation = ({
  isActive,
  isPage = false,
  onNewChat,
  session,
}: {
  isActive: boolean
  /** Agent mode: the chat fills the workspace, so its column is centered and capped. */
  isPage?: boolean
  onNewChat: () => void
  session: ChatSession
}) => {
  const column = cn(isPage && 'mx-auto w-full max-w-3xl')

  return (
    <>
      <ChatMessages
        className={column}
        decide={session.isReady ? session.decide : undefined}
        isPending={session.isStreaming}
        messages={session.messages}
      />
      {session.error && (
        <ChatError
          className={column}
          error={session.error}
          onRetry={() => session.retry()}
        />
      )}
      {session.isPaused && (
        <ChatPaused className={column} onContinue={() => session.resume()} />
      )}
      <ChatInput
        className={cn(column, isPage && 'pb-4')}
        isActive={isActive}
        isStreaming={session.isStreaming}
        onCommand={onNewChat}
        onSend={(text, mentions) => {
          void session.send(text, mentions)
        }}
        onStop={() => session.stop()}
      />
    </>
  )
}
