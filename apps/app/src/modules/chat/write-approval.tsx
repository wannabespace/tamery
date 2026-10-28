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

import { agentDatabase } from '~/core/agent/database'
import { WriteEstimate } from '~/core/agent/write-estimate'
import type { Connection } from '~/core/connection/sync'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import type { ToolPartActions } from './chat-tool-types'

export const WriteApproval = ({
  connection,
  decideWrite,
  input,
  toolCallId,
}: {
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

  return (
    <div className="bg-background ring-foreground/4 flex flex-col gap-2 rounded-xl p-2 ring">
      <ResponseCodeBlock code={input.statement} language="sql" />
      {typeof estimate.data === 'number' && (
        <div className="pl-1">
          <WriteEstimate rows={estimate.data} />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground mr-auto pl-1 text-xs">
          Runs on <span data-mask>{connection?.name}</span> once you approve
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
        <Tooltip>
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
          <TooltipContent side="top">
            {destructive ? 'Removes data or schema' : 'Run this statement'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
