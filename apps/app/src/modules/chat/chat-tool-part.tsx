import {
  DatabaseIcon,
  PencilEdit02Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { ResponseCodeBlock } from '@tamery/ui/components/response'
import { Spinner } from '@tamery/ui/components/spinner'
import type { ToolUIPart } from 'ai'

import { tableTypeIcon } from '~/core/catalog/table-type'
import { useCollections } from '~/core/collections'

import { ChatDisclosure } from './chat-disclosure'
import { ToolResult } from './tool-result'
import { WriteApproval } from './write-approval'

type ChatToolPart = Extract<AppUIMessage['parts'][number], ToolUIPart>

export interface ToolPartActions {
  /** Set only while a pending change may still be decided: on the last turn, with nothing streaming. */
  decideWrite?: (decision: {
    approved: boolean
    input: ChatTools['execute']['input']
    toolCallId: string
  }) => Promise<void>
  /** On the last turn a pending call is still running; on an earlier one it never ran. */
  isLast: boolean
}

const isSettled = (part: ChatToolPart) =>
  part.state === 'output-available' || part.state === 'output-error'

const getStatus = (part: ChatToolPart, isLast: boolean) => {
  if (part.state === 'output-error') {
    return <span className="text-destructive">Failed</span>
  }
  if (isSettled(part)) {
    return null
  }
  return isLast ? (
    <Spinner className="size-3" />
  ) : (
    <span className="text-muted-foreground">Not run</span>
  )
}

const getLabel = (part: ChatToolPart) => {
  switch (part.type) {
    case 'tool-describe_table': {
      return part.input?.table ? `Read ${part.input.table}` : 'Read a table'
    }
    case 'tool-list_connections': {
      return 'Listed connections'
    }
    case 'tool-list_tables': {
      return part.input?.schema
        ? `Listed tables in ${part.input.schema}`
        : 'Listed tables'
    }
    default: {
      return null
    }
  }
}

const getIcon = (part: ChatToolPart) => {
  switch (part.type) {
    case 'tool-describe_table':
    case 'tool-list_tables': {
      return tableTypeIcon.table
    }
    case 'tool-execute': {
      return PencilEdit02Icon
    }
    case 'tool-query': {
      return DatabaseIcon
    }
    default: {
      return Wrench01Icon
    }
  }
}

const StatementPart = ({
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
    !!actions.decideWrite

  return (
    <div className="flex flex-col gap-2">
      <ChatDisclosure
        icon={getIcon(part)}
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
        {input?.sql && <ResponseCodeBlock code={input.sql} language="sql" />}
        {part.state === 'output-error' && (
          <ResponseCodeBlock code={part.errorText} language="text" />
        )}
      </ChatDisclosure>
      {awaitsApproval && actions.decideWrite && (
        <WriteApproval
          connection={connection}
          decideWrite={actions.decideWrite}
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

export const ToolPart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: ChatToolPart
}) => {
  if (part.type === 'tool-execute' || part.type === 'tool-query') {
    return <StatementPart actions={actions} part={part} />
  }

  return (
    <ChatDisclosure
      icon={getIcon(part)}
      label={getLabel(part)}
      status={getStatus(part, actions.isLast)}
    >
      {part.state === 'output-available' && part.output !== undefined && (
        <ResponseCodeBlock
          code={JSON.stringify(part.output, null, 2)}
          language="json"
        />
      )}
      {part.state === 'output-error' && (
        <ResponseCodeBlock code={part.errorText} language="text" />
      )}
    </ChatDisclosure>
  )
}
