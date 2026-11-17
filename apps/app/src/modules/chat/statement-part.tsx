import type { ChatTools } from '@tamery/ai/tools'

import { useCollections } from '~/core/collections'

import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { StatementCard } from './statement-card'
import { getStatus, isAnsweredByApp } from './tool-status'
import { WriteApproval } from './write-approval'

const usePartConnection = (connectionId: string | undefined) => {
  const { connectionsCollection } = useCollections()
  return connectionId ? connectionsCollection.get(connectionId) : undefined
}

/** A call that names no resource runs on its connection's default one, which its card names too. */
const usePartTarget = <T extends ChatTools['query']['input']>(
  input: T | undefined
) => {
  const { connectionStringsCollection } = useCollections()
  return (
    input && {
      ...input,
      resource:
        input.resource ??
        connectionStringsCollection.get(input.connectionId)
          ?.defaultResourceName ??
        null,
    }
  )
}

export const ExplainPlan = ({
  input,
  sets,
}: {
  input: ChatTools['explain']['input']
  sets: ChatTools['explain']['output']
}) => {
  const connection = usePartConnection(input.connectionId)
  const target = usePartTarget(input)
  return (
    <StatementCard
      connection={connection}
      sets={sets}
      statement={input.statement}
      status={null}
      target={connection && target}
    />
  )
}

export const StatementPart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: Extract<ChatToolPart, { type: 'tool-execute' | 'tool-query' }>
}) => {
  const { input } = part
  const connection = usePartConnection(input?.connectionId)
  const target = usePartTarget(
    part.state === 'input-streaming' ? undefined : part.input
  )
  const awaitsApproval =
    part.type === 'tool-execute' &&
    part.state === 'input-available' &&
    !!actions.decide

  if (part.state === 'input-streaming' && !connection) {
    return null
  }

  return (
    <StatementCard
      connection={connection}
      error={
        part.state === 'output-error' && !isAnsweredByApp(part)
          ? part.errorText
          : undefined
      }
      sets={part.state === 'output-available' ? part.output : undefined}
      statement={input?.statement}
      status={
        awaitsApproval && actions.decide ? (
          <WriteApproval
            connection={connection}
            auto={actions.decide.auto}
            decideWrite={actions.decide.write}
            input={part.input}
            toolCallId={part.toolCallId}
          />
        ) : (
          getStatus(part, actions.isLive)
        )
      }
      target={connection && target}
    />
  )
}
