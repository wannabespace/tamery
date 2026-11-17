import type { StatementVerdict } from '@tamery/ai/features/judge-statement'
import type { ChatTools } from '@tamery/ai/tools'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { Button } from '@tamery/ui/components/button'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { agentDatabase } from '~/core/agent/database'
import type { Connection } from '~/core/connection/sync'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'
import { plural } from '~/utils/plural'

import type { ToolPartActions } from './chat-tool-types'
import { approvalModeValue } from './stores'

const judgedOutcome = (verdict: StatementVerdict | null) => {
  if (!verdict) {
    return 'none'
  }
  return verdict.autoRun ? 'run' : 'ask'
}

const autoNote = (state: {
  changesExisting: boolean
  checking: boolean
  judged: boolean
  runs: boolean
  unjudged: boolean
}) => {
  if (state.checking) {
    return 'Auto is checking'
  }
  if (state.runs) {
    return 'Auto is running it'
  }
  if (state.unjudged) {
    return "Auto couldn't check it, so it waits"
  }
  if (state.judged) {
    return 'Not sure it is what you asked, so it waits'
  }
  if (state.changesExisting) {
    return 'Edits existing data, so it waits'
  }
  return null
}

export const WriteApproval = ({
  connection,
  decideWrite,
  input,
  judge,
  toolCallId,
}: {
  connection: Connection | undefined
  decideWrite: NonNullable<ToolPartActions['decide']>['write']
  judge: NonNullable<ToolPartActions['decide']>['judge']
  input: ChatTools['execute']['input']
  toolCallId: string
}) => {
  const { data: write } = useQuery({
    queryFn: () => agentDatabase.prepareWrite(input),
    queryKey: ['agent-write-prepare', toolCallId],
    retry: false,
    staleTime: Infinity,
  })
  const destructive = write?.kind === 'destructive'
  const isAuto = useSubscription(approvalModeValue) === 'auto'
  const decision = {
    destructive,
    dialect: connection ? getDialect(connection.type) : null,
  }
  const estimateKey = ['agent-estimate', toolCallId]
  const estimate = useQuery({
    enabled: !!write,
    queryFn: ({ signal }) => write?.estimate(signal) ?? null,
    queryKey: estimateKey,
    retry: false,
    staleTime: Infinity,
  })
  const runKey = ['agent-write', toolCallId]
  const isRunning = useIsMutating({ mutationKey: runKey }) > 0
  const run = useMutation({
    meta: { event: 'ai_chat_write_run' },
    mutationKey: runKey,
    mutationFn: async () => {
      await queryClient.cancelQueries({ queryKey: estimateKey })
      return decideWrite({ approved: true, input, toolCallId })
    },
  })
  const verdict = useQuery({
    enabled: isAuto && !!write?.additive,
    queryFn: async ({ signal }) => {
      const result = await judge({
        dialect: connection?.type ?? 'unknown',
        signal,
        statement: input.statement,
      }).catch(() => null)
      posthog.capture('ai_chat_write_judged', {
        ...decision,
        judge: result?.judge ?? null,
        outcome: judgedOutcome(result),
      })
      return result
    },
    queryKey: ['agent-write-judge', toolCallId],
    retry: false,
    staleTime: Infinity,
  })
  const autoRuns = !!verdict.data?.autoRun

  useEffect(() => {
    if (autoRuns && run.isIdle && !isRunning) {
      run.mutate()
    }
  }, [autoRuns, run, isRunning])

  const note = autoNote({
    changesExisting: isAuto && !!write && !write.additive,
    checking: verdict.isFetching,
    judged: isAuto && verdict.isFetched,
    runs: autoRuns,
    unjudged: isAuto && verdict.isFetched && !verdict.data,
  })

  const hint = [
    note,
    typeof estimate.data === 'number' && `~${plural(estimate.data, 'row')}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {hint && (
        <span className={cn('truncate', verdict.isFetching && 'shimmer')}>
          {hint}
        </span>
      )}
      <Button
        size="xs"
        variant="ghost-muted"
        disabled={isRunning}
        onClick={() => {
          posthog.capture('ai_chat_write_declined', decision)
          void decideWrite({ approved: false, input, toolCallId })
        }}
      >
        Decline
      </Button>
      <Tooltip disabled={!destructive}>
        <TooltipTrigger
          render={
            <Button
              size="xs"
              variant={destructive ? 'destructive' : 'default'}
              disabled={isRunning}
              onClick={() => {
                posthog.capture('ai_chat_write_approved', decision)
                run.mutate()
              }}
            />
          }
        >
          {isRunning && <Spinner />}
          Run
        </TooltipTrigger>
        <TooltipContent side="top">
          Changes or removes existing data or schema
        </TooltipContent>
      </Tooltip>
    </>
  )
}
