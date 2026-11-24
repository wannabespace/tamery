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

import { autoApprovalsStore, estimateKey } from './auto-approval'
import type { ToolPartActions } from './chat-tool-types'
import { approvalModeValue, hasDecidedChangeValue } from './stores'

const AUTO_NOTES = { checking: 'Auto is checking', run: 'Auto is running it' }

export const WriteApproval = ({
  auto,
  connection,
  decideWrite,
  input,
  toolCallId,
}: {
  auto: NonNullable<ToolPartActions['decide']>['auto']
  connection: Connection | undefined
  decideWrite: NonNullable<ToolPartActions['decide']>['write']
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
  const hasDecided = useSubscription(hasDecidedChangeValue)
  const approval = useSubscription(autoApprovalsStore, {
    selector: (approvals) => approvals[toolCallId] ?? null,
  })
  const decision = {
    destructive,
    dialect: connection ? getDialect(connection.type) : null,
  }
  const estimate = useQuery({
    enabled: !!write,
    queryFn: ({ signal }) => write?.estimate(signal) ?? null,
    queryKey: estimateKey(toolCallId),
    retry: false,
    staleTime: Infinity,
  })
  const runKey = ['agent-write', toolCallId]
  const isRunning =
    useIsMutating({ mutationKey: runKey }) > 0 || approval === 'run'
  const run = useMutation({
    meta: { event: 'ai_chat_write_run' },
    mutationKey: runKey,
    mutationFn: async () => {
      await queryClient.cancelQueries({ queryKey: estimateKey(toolCallId) })
      return decideWrite({ approved: true, input, toolCallId })
    },
  })

  // A call no window judged yet: Auto switched on while it waits, or the window reloaded since.
  useEffect(() => {
    if (isAuto) {
      void auto({ input, toolCallId })
    }
  }, [auto, input, isAuto, toolCallId])

  const note = approval && AUTO_NOTES[approval]

  const hint = [
    note,
    typeof estimate.data === 'number' && `~${plural(estimate.data, 'row')}`,
    !isAuto && !hasDecided && 'Changes wait for Run unless Auto is on',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {hint && (
        <span className={cn('truncate', approval === 'checking' && 'shimmer')}>
          {hint}
        </span>
      )}
      <Button
        size="xs"
        variant="ghost-muted"
        disabled={isRunning}
        onClick={() => {
          posthog.capture('ai_chat_write_declined', decision)
          hasDecidedChangeValue.set(true)
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
                hasDecidedChangeValue.set(true)
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
