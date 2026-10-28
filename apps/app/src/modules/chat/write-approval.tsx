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
import { getQueryLanguage } from '~/core/runtime/language'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import type { ToolPartActions } from './chat-tool-part'

export const WriteApproval = ({
  connection,
  decideWrite,
  input,
  toolCallId,
}: {
  connection: Connection | undefined
  decideWrite: NonNullable<ToolPartActions['decideWrite']>
  input: ChatTools['execute']['input']
  toolCallId: string
}) => {
  const dialect = connection ? getDialect(connection.type) : null
  const destroys = dialect
    ? getQueryLanguage(dialect).destructive(input.sql)
    : []
  const decision = { destructive: destroys.length > 0, dialect }
  const estimateKey = ['agent-estimate', toolCallId]
  const estimate = useQuery({
    queryFn: async ({ signal }) => {
      const write = await agentDatabase.prepareWrite(input)
      return write.estimate(signal)
    },
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
      <ResponseCodeBlock code={input.sql} language="sql" />
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
                variant={destroys.length > 0 ? 'destructive' : 'default'}
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
            {destroys.length > 0
              ? `Removes data: ${destroys.join(', ')}`
              : 'Run this statement'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
