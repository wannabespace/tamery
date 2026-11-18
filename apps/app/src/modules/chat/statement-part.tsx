import type { ChatDataParts, ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'

import { useCollections } from '~/core/collections'

import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { StatementCard, summarize } from './statement-card'
import { getStatus, isAnsweredByApp, isSkipped } from './tool-status'
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

/** A statement the user ran themselves, from the composer or a skipped change's card. */
export const SqlRunCard = ({ data }: { data: ChatDataParts['sql'] }) => {
  const connection = usePartConnection(data.connectionId)
  const target = usePartTarget(data)
  return (
    <StatementCard
      connection={connection}
      error={data.error ?? undefined}
      statement={data.statement}
      sets={data.output ?? undefined}
      status={
        <span className={data.error ? 'text-destructive' : undefined}>
          {data.output ? `You ran · ${summarize(data.output)}` : 'Failed'}
        </span>
      }
      target={connection && target}
    />
  )
}

const SkippedRun = ({
  skipped,
  statement,
  toolCallId,
}: {
  skipped: NonNullable<ToolPartActions['skipped']>
  statement: string
  toolCallId: string
}) =>
  skipped.ran.has(toolCallId) ? (
    <span className="text-muted-foreground">You ran it</span>
  ) : (
    <>
      <span className="text-muted-foreground truncate">
        Skipped: Auto was not sure it is what you asked
      </span>
      <Button
        size="xs"
        variant="default"
        onClick={() => skipped.run(statement, toolCallId)}
      >
        Run
      </Button>
    </>
  )

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

  let status = getStatus(part, actions.isLive)
  if (awaitsApproval && actions.decide) {
    status = (
      <WriteApproval
        connection={connection}
        auto={actions.decide.auto}
        decideWrite={actions.decide.write}
        input={part.input}
        toolCallId={part.toolCallId}
      />
    )
  } else if (isSkipped(part) && input?.statement && actions.skipped) {
    status = (
      <SkippedRun
        skipped={actions.skipped}
        statement={input.statement}
        toolCallId={part.toolCallId}
      />
    )
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
      status={status}
      target={connection && target}
    />
  )
}
