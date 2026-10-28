import {
  DatabaseIcon,
  PencilEdit02Icon,
  Search01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { ResponseCodeBlock } from '@tamery/ui/components/response'

import { tableTypeIcon } from '~/core/catalog/table-type'
import { useCollections } from '~/core/collections'

import { ChangeReview } from './change-review'
import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { NotePart } from './note-part'
import { ToolResult } from './tool-result'
import { getStatus } from './tool-status'
import { WriteApproval } from './write-approval'

/** A call's line names its input's `detail` field when the model has sent it. */
const LABELS: Partial<
  Record<
    ChatToolPart['type'],
    { detail?: string; plain: string; with?: string }
  >
> = {
  'tool-column_values': {
    detail: 'column',
    plain: 'Read column values',
    with: 'Read values of',
  },
  'tool-describe_table': {
    detail: 'table',
    plain: 'Read a table',
    with: 'Read',
  },
  'tool-explain': { plain: 'Read a query plan' },
  'tool-export_result': {
    detail: 'format',
    plain: 'Exported a result',
    with: 'Exported a result as',
  },
  'tool-list_connections': { plain: 'Listed connections' },
  'tool-list_tables': {
    detail: 'schema',
    plain: 'Listed tables',
    with: 'Listed tables in',
  },
  'tool-open_query': { plain: 'Opened a Query tab' },
  'tool-open_table': {
    detail: 'table',
    plain: 'Opened a table',
    with: 'Opened',
  },
  'tool-propose_change': {
    detail: 'table',
    plain: 'Drafting a change',
    with: 'Drafting a change in',
  },
  'tool-search_saved_queries': {
    detail: 'query',
    plain: 'Searched saved queries',
    with: 'Searched saved queries for',
  },
  'tool-search_schema': {
    detail: 'query',
    plain: 'Searched the schema',
    with: 'Searched the schema for',
  },
}

const getLabel = (part: ChatToolPart) => {
  const label = LABELS[part.type]
  if (!label) {
    return null
  }
  const detail: unknown = Object.entries(part.input ?? {}).find(
    ([key]) => key === label.detail
  )?.[1]
  return typeof detail === 'string' && detail
    ? `${label.with} ${detail}`
    : label.plain
}

const getIcon = (part: ChatToolPart) => {
  switch (part.type) {
    case 'tool-column_values':
    case 'tool-describe_table':
    case 'tool-list_tables': {
      return tableTypeIcon.table
    }
    case 'tool-search_saved_queries':
    case 'tool-search_schema': {
      return Search01Icon
    }
    case 'tool-execute':
    case 'tool-propose_change': {
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
    !!actions.decide

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
      {awaitsApproval && actions.decide && (
        <WriteApproval
          connection={connection}
          decideWrite={actions.decide.write}
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
  if (part.type === 'tool-combine') {
    return (
      <div className="flex flex-col gap-2">
        <ChatDisclosure
          icon={DatabaseIcon}
          label="Combined results"
          status={getStatus(part, actions.isLast)}
        >
          {part.input?.sql && (
            <ResponseCodeBlock code={part.input.sql} language="sql" />
          )}
          {part.state === 'output-error' && (
            <ResponseCodeBlock code={part.errorText} language="text" />
          )}
        </ChatDisclosure>
        {part.state === 'output-available' && (
          <ToolResult connection={null} sets={part.output} target={null} />
        )}
      </div>
    )
  }
  if (part.type === 'tool-propose_note') {
    return <NotePart actions={actions} part={part} />
  }
  if (
    part.type === 'tool-propose_change' &&
    part.state === 'output-available'
  ) {
    return (
      <div className="flex flex-col gap-2">
        <ChatDisclosure
          icon={PencilEdit02Icon}
          label={`Drafted a change in ${part.input.table}`}
        >
          <ResponseCodeBlock
            code={JSON.stringify(part.input.change, null, 2)}
            language="json"
          />
        </ChatDisclosure>
        <ChangeReview input={part.input} output={part.output} />
      </div>
    )
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
