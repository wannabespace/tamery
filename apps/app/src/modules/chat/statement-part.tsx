import type { ChatTools } from '@tamery/ai/tools'

import { useCollections } from '~/core/collections'

import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { StatementCard } from './statement-card'
import { getStatus, isDeclined } from './tool-status'
import { WriteApproval } from './write-approval'

const usePartConnection = (connectionId: string | undefined) => {
  const { connectionsCollection } = useCollections()
  return connectionId ? connectionsCollection.get(connectionId) : undefined
}

export const ExplainPlan = ({
  input,
  sets,
}: {
  input: ChatTools['explain']['input']
  sets: ChatTools['explain']['output']
}) => {
  const connection = usePartConnection(input.connectionId)
  return (
    <StatementCard
      connection={connection}
      sets={sets}
      statement={input.statement}
      status={null}
      target={connection && input}
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
        part.state === 'output-error' && !isDeclined(part)
          ? part.errorText
          : undefined
      }
      sets={part.state === 'output-available' ? part.output : undefined}
      statement={input?.statement}
      status={
        awaitsApproval && actions.decide ? (
          <WriteApproval
            connection={connection}
            decideWrite={actions.decide.write}
            judge={actions.decide.judge}
            input={part.input}
            toolCallId={part.toolCallId}
          />
        ) : (
          getStatus(part, actions.isLast)
        )
      }
      target={
        connection && part.state !== 'input-streaming' ? part.input : undefined
      }
    />
  )
}
