import type { StatementVerdict } from '@tamery/ai/features/judge-statement'
import type { ChatTools } from '@tamery/ai/tools'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { Button } from '@tamery/ui/components/button'
import { ResponseCodeBlock } from '@tamery/ui/components/response'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { agentDatabase } from '~/core/agent/database'
import { WriteEstimate } from '~/core/agent/write-estimate'
import type { Connection } from '~/core/connection/sync'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import type { ToolPartActions } from './chat-tool-types'
import { approvalModeValue } from './stores'

const judgedOutcome = (verdict: StatementVerdict | null) => {
  if (!verdict) {
    return 'none'
  }
  return verdict.autoRun ? 'run' : 'ask'
}

const autoNote = (state: {
  asked: boolean
  changesExisting: boolean
  checking: boolean
  runs: boolean
}) => {
  if (state.checking) {
    return 'Auto is checking this change'
  }
  if (state.runs) {
    return 'Auto is running this change'
  }
  if (state.asked) {
    return 'Auto wants your review before this runs'
  }
  if (state.changesExisting) {
    return 'Changes to existing data always wait for you'
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
    asked: isAuto && verdict.isFetched,
    changesExisting: isAuto && !!write && !write.additive,
    checking: verdict.isFetching,
    runs: autoRuns,
  })

  return (
    <div className="bg-background ring-foreground/4 flex flex-col gap-2 rounded-xl p-2 ring">
      <ResponseCodeBlock code={input.statement} language="sql" />
      {typeof estimate.data === 'number' && (
        <div className="pl-1">
          <WriteEstimate rows={estimate.data} />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground mr-auto flex items-center gap-1.5 pl-1 text-xs">
          {verdict.isFetching && <Spinner />}
          {note ?? (
            <span>
              Runs on <span data-mask>{connection?.name}</span> once you approve
            </span>
          )}
        </span>
        <Button
          size="sm"
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
                size="sm"
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
          <TooltipContent side="top">Removes data or schema</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
