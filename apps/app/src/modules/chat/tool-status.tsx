import { SKIPPED } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'

import { useCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'

import type { ChatToolPart } from './chat-tool-types'
import { DECLINED, READ_ONLY } from './chat-tools'
import { startNewChat } from './open-chat'

const isDeclined = (part: ChatToolPart) =>
  part.state === 'output-error' && part.errorText === DECLINED

const isReadOnly = (
  part: ChatToolPart
): part is Extract<ChatToolPart, { state: 'output-error' }> =>
  part.state === 'output-error' && part.errorText === READ_ONLY

export const isSkipped = (part: ChatToolPart) =>
  part.state === 'output-error' && part.errorText === SKIPPED

/** Its error was written for the model, and the card's status says it instead. */
export const isAnsweredByApp = (part: ChatToolPart) =>
  isDeclined(part) || isReadOnly(part) || isSkipped(part)

/** While its turn still works an unsettled call is running; once the turn ended or was stopped, it never ran. */
export const isRunning = (part: ChatToolPart, isLive: boolean) =>
  isLive && part.state !== 'output-available' && part.state !== 'output-error'

const ReadOnly = ({
  connectionId,
  resource,
}: {
  connectionId: string
  resource: string | null
}) => {
  const { connectionStringsCollection, connectionsResourcesCollection } =
    useCollections()
  const name =
    resource ??
    connectionStringsCollection.get(connectionId)?.defaultResourceName ??
    null
  const target = connectionsResourcesCollection.toArray.find(
    (item) => item.connectionId === connectionId && item.name === name
  )
  return (
    <>
      <span className="text-muted-foreground">Read-only</span>
      {target && (
        <Button
          size="xs"
          variant="ghost-muted"
          onClick={() => {
            posthog.capture('ai_chat_read_only_opened')
            startNewChat(target.id)
          }}
        >
          Open chat
        </Button>
      )}
    </>
  )
}

export const getStatus = (part: ChatToolPart, isLive: boolean) => {
  if (isReadOnly(part) && part.type === 'tool-execute' && part.input) {
    return (
      <ReadOnly
        connectionId={part.input.connectionId}
        resource={part.input.resource}
      />
    )
  }
  if (isDeclined(part)) {
    return <span className="text-muted-foreground">Declined</span>
  }
  if (isSkipped(part)) {
    return <span className="text-muted-foreground">Skipped</span>
  }
  if (part.state === 'output-error') {
    return <span className="text-destructive">Failed</span>
  }
  if (part.state === 'output-available') {
    return null
  }
  return isLive ? (
    <span className="shimmer">Running</span>
  ) : (
    <span className="text-muted-foreground">Not run</span>
  )
}
