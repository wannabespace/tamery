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
import { useMutation } from '@tanstack/react-query'

import type { Connection } from '~/core/connection/sync'
import { getQueryLanguage } from '~/core/runtime/language'

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
  const destroys = connection
    ? getQueryLanguage(getDialect(connection.type)).destructive(input.sql)
    : []
  const run = useMutation({
    meta: { event: 'ai_chat_write_run' },
    mutationFn: () => decideWrite({ approved: true, input, toolCallId }),
  })

  return (
    <div className="bg-background ring-foreground/4 flex flex-col gap-2 rounded-xl p-2 ring">
      <ResponseCodeBlock code={input.sql} language="sql" />
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground mr-auto pl-1 text-xs">
          Runs on <span data-mask>{connection?.name}</span> once you approve
        </span>
        <Button
          size="sm"
          variant="ghost-muted"
          disabled={run.isPending}
          onClick={() => {
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
                disabled={run.isPending}
                onClick={() => run.mutate()}
              />
            }
          >
            {run.isPending && <Spinner />}
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
