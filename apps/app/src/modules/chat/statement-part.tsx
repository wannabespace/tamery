import { DatabaseIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { ResponseCodeBlock } from '@tamery/ui/components/response'

import { useCollections } from '~/core/collections'

import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { ToolResult } from './tool-result'
import { getStatus } from './tool-status'
import { WriteApproval } from './write-approval'

export const StatementPart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: Extract<ChatToolPart, { type: 'tool-execute' | 'tool-query' }>
}) => {
  const { connectionsCollection } = useCollections()
  const { input } = part
  const connection = input?.connectionId
    ? connectionsCollection.get(input.connectionId)
    : undefined
  const verb = part.type === 'tool-execute' ? 'Change' : 'Query'
  const awaitsApproval =
    part.type === 'tool-execute' &&
    part.state === 'input-available' &&
    !!actions.decide

  return (
    <div className="flex flex-col gap-2">
      <ChatDisclosure
        icon={part.type === 'tool-execute' ? PencilEdit02Icon : DatabaseIcon}
        label={
          connection ? (
            <>
              {verb} on <span data-mask>{connection.name}</span>
            </>
          ) : (
            verb
          )
        }
        status={
          awaitsApproval ? (
            <span className="text-warning">Needs approval</span>
          ) : (
            getStatus(part, actions.isLast)
          )
        }
      >
        {input?.statement && (
          <ResponseCodeBlock code={input.statement} language="sql" />
        )}
        {part.state === 'output-error' && (
          <ResponseCodeBlock code={part.errorText} language="text" />
        )}
      </ChatDisclosure>
      {awaitsApproval && actions.decide && (
        <WriteApproval
          connection={connection}
          decideWrite={actions.decide.write}
          judge={actions.decide.judge}
          input={part.input}
          toolCallId={part.toolCallId}
        />
      )}
      {part.state === 'output-available' && connection && (
        <ToolResult
          connection={connection}
          sets={part.output}
          target={part.input}
        />
      )}
    </div>
  )
}
