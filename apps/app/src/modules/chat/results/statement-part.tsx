import type { ChatDataParts, ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { useSubscription } from 'seitu/react'

import { useCollections } from '~/core/collections'

import { WriteApproval } from '../approval/write-approval'
import type { ChatToolPart, ToolPartActions } from '../tools/chat-tool-types'
import { decidedElsewhereStore } from '../tools/chat-tools'
import { getStatus, isAnsweredByApp, isSkipped } from '../tools/tool-status'
import type { StatementSource } from './statement-card'
import { StatementCard, summarize } from './statement-card'

const usePartSource = (connectionId: string | undefined): StatementSource => {
  const { connectionsCollection } = useCollections()
  const connection = connectionId && connectionsCollection.get(connectionId)
  return connection ? { connection, kind: 'connection' } : { kind: 'missing' }
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
  const source = usePartSource(input.connectionId)
  const target = usePartTarget(input)
  return (
    <StatementCard
      sets={sets}
      source={source}
      statement={input.statement}
      status={null}
      target={target}
    />
  )
}

/** A statement the user ran themselves, from the composer or a skipped change's card. */
export const SqlRunCard = ({ data }: { data: ChatDataParts['sql'] }) => {
  const source = usePartSource(data.connectionId)
  const target = usePartTarget(data)
  return (
    <StatementCard
      error={data.error ?? undefined}
      source={source}
      statement={data.statement}
      sets={data.output ?? undefined}
      status={
        <span className={data.error ? 'text-destructive' : undefined}>
          {data.output ? `You ran · ${summarize(data.output)}` : 'Failed'}
        </span>
      }
      target={target}
    />
  )
}

const SkippedRun = ({
  input,
  skipped,
  toolCallId,
}: {
  input: ChatTools['execute']['input']
  skipped: NonNullable<ToolPartActions['skipped']>
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
        onClick={() => skipped.run(input, toolCallId)}
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
  const source = usePartSource(input?.connectionId)
  const target = usePartTarget(
    part.state === 'input-streaming' ? undefined : part.input
  )
  const isDecidedElsewhere = useSubscription(decidedElsewhereStore, {
    selector: (calls) => !!calls[part.toolCallId],
  })
  const awaitsApproval =
    part.type === 'tool-execute' &&
    part.state === 'input-available' &&
    !!actions.decide

  if (part.state === 'input-streaming' && source.kind === 'missing') {
    return null
  }

  let status = getStatus(part, actions.isLive)
  if (awaitsApproval && isDecidedElsewhere) {
    status = (
      <span className="text-muted-foreground">Decided in another window</span>
    )
  } else if (awaitsApproval && actions.decide) {
    status = (
      <WriteApproval
        auto={actions.decide.auto}
        decideWrite={actions.decide.write}
        input={part.input}
        source={source}
        toolCallId={part.toolCallId}
      />
    )
  } else if (isSkipped(part) && target?.statement && actions.skipped) {
    status = (
      <SkippedRun
        input={target}
        skipped={actions.skipped}
        toolCallId={part.toolCallId}
      />
    )
  }

  return (
    <StatementCard
      error={
        part.state === 'output-error' && !isAnsweredByApp(part)
          ? part.errorText
          : undefined
      }
      sets={part.state === 'output-available' ? part.output : undefined}
      source={source}
      statement={input?.statement}
      status={status}
      target={target}
    />
  )
}
