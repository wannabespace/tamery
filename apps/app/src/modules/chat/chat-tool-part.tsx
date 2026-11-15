import {
  DatabaseIcon,
  HierarchyIcon,
  PencilEdit02Icon,
  PlayIcon,
  Search01Icon,
  ServerStack01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'

import { tableTypeIcon } from '~/core/catalog/table-type'

import { ChangeReview } from './change-review'
import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { NotePart } from './note-part'
import { StatementCard } from './statement-card'
import { ExplainPlan, StatementPart } from './statement-part'
import { SubagentPart } from './subagent-part'
import { getStatus, isDeclined, isRunning } from './tool-status'

/** A call's line, in the past once it is done and in the present while it runs; it names its input's `detail` field once the model has sent it. */
const LABELS: Partial<
  Record<
    ChatToolPart['type'],
    { detail?: string; done: string; live: string; object?: string }
  >
> = {
  'tool-column_values': {
    detail: 'column',
    done: 'Read values of',
    live: 'Reading values of',
    object: 'a column',
  },
  'tool-create_share': {
    detail: 'table',
    done: 'Opened sharing for',
    live: 'Opening sharing for',
    object: 'a table',
  },
  'tool-describe_table': {
    detail: 'table',
    done: 'Read',
    live: 'Reading',
    object: 'a table',
  },
  'tool-explain': {
    done: 'Read the query plan',
    live: 'Reading the query plan',
  },
  'tool-export_result': {
    detail: 'format',
    done: 'Exported a result as',
    live: 'Exporting a result as',
    object: 'a file',
  },
  'tool-list_connections': {
    done: 'Listed connections',
    live: 'Listing connections',
  },
  'tool-list_tables': {
    detail: 'schema',
    done: 'Listed tables in',
    live: 'Listing tables in',
    object: 'the database',
  },
  'tool-open_query': {
    done: 'Opened a Query tab',
    live: 'Opening a Query tab',
  },
  'tool-open_table': {
    detail: 'table',
    done: 'Opened',
    live: 'Opening',
    object: 'a table',
  },
  'tool-propose_change': {
    detail: 'table',
    done: 'Drafted a change in',
    live: 'Drafting a change in',
    object: 'a table',
  },
  'tool-propose_note': {
    detail: 'table',
    done: 'Saved a schema note on',
    live: 'Saving a schema note on',
    object: 'this database',
  },
  'tool-search_saved_queries': {
    detail: 'query',
    done: 'Searched saved queries for',
    live: 'Searching saved queries for',
    object: 'a query',
  },
  'tool-search_schema': {
    detail: 'query',
    done: 'Searched the schema for',
    live: 'Searching the schema for',
    object: 'names',
  },
}

const getDetailValue = (part: ChatToolPart, key: string | undefined) => {
  const value: unknown = Object.entries(part.input ?? {}).find(
    ([name]) => name === key
  )?.[1]
  return typeof value === 'string' && value ? value : null
}

const getLabel = (part: ChatToolPart) => {
  const label = LABELS[part.type]
  if (!label) {
    return null
  }
  const detail = getDetailValue(part, label.detail)
  if (detail) {
    return (
      <>
        {label.done} <InlineCode data-mask>{detail}</InlineCode>
      </>
    )
  }
  return label.object ? `${label.done} ${label.object}` : label.done
}

/** What a running call is doing, as plain text a shimmer can sweep. */
export const getLiveLabel = (part: ChatToolPart) => {
  const label = LABELS[part.type]
  if (!label) {
    return 'Working'
  }
  const object = getDetailValue(part, label.detail) ?? label.object
  return object ? `${label.live} ${object}` : label.live
}

const listAt = (value: unknown, key: string): unknown[] => {
  const found: unknown =
    value && typeof value === 'object'
      ? Object.entries(value).find(([name]) => name === key)?.[1]
      : undefined
  return Array.isArray(found) ? found : []
}

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

const getSummary = (part: ChatToolPart) => {
  if (part.state !== 'output-available') {
    return null
  }
  switch (part.type) {
    case 'tool-list_connections': {
      return Array.isArray(part.output)
        ? counted(part.output.length, 'connection', 'connections')
        : null
    }
    case 'tool-list_tables': {
      const tables = listAt(part.output, 'schemas').flatMap((schema) =>
        listAt(schema, 'tables')
      )
      return counted(tables.length, 'table', 'tables')
    }
    case 'tool-describe_table': {
      return counted(listAt(part.output, 'columns').length, 'column', 'columns')
    }
    case 'tool-search_schema': {
      return counted(
        listAt(part.output, 'tables').length +
          listAt(part.output, 'columns').length,
        'match',
        'matches'
      )
    }
    case 'tool-search_saved_queries': {
      return counted(listAt(part.output, 'queries').length, 'query', 'queries')
    }
    default: {
      return null
    }
  }
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
    case 'tool-propose_change': {
      return PencilEdit02Icon
    }
    case 'tool-query': {
      return DatabaseIcon
    }
    case 'tool-list_connections': {
      return ServerStack01Icon
    }
    case 'tool-explain': {
      return HierarchyIcon
    }
    case 'tool-open_query': {
      return PlayIcon
    }
    default: {
      return Wrench01Icon
    }
  }
}

const getDetail = (part: ChatToolPart) => {
  if (part.type === 'tool-explain' && part.state === 'output-available') {
    return <ExplainPlan input={part.input} sets={part.output} />
  }
  if (part.state === 'output-error' && !isDeclined(part)) {
    return (
      <p data-mask className="text-destructive text-xs whitespace-pre-wrap">
        {part.errorText}
      </p>
    )
  }
  return null
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
      <StatementCard
        connection={null}
        error={part.state === 'output-error' ? part.errorText : undefined}
        sets={part.state === 'output-available' ? part.output : undefined}
        statement={part.input?.statement}
        status={getStatus(part, actions.isLast)}
      />
    )
  }
  if (part.type === 'tool-propose_note') {
    return <NotePart isLast={actions.isLast} part={part} />
  }
  if (part.type === 'tool-spawn_agent') {
    return <SubagentPart isLast={actions.isLast} part={part} />
  }
  if (
    part.type === 'tool-propose_change' &&
    part.state === 'output-available'
  ) {
    return <ChangeReview input={part.input} output={part.output} />
  }

  const running = isRunning(part, actions.isLast)
  return (
    <ChatDisclosure
      icon={getIcon(part)}
      label={running ? getLiveLabel(part) : getLabel(part)}
      live={running}
      status={!running && getStatus(part, actions.isLast)}
      summary={getSummary(part)}
    >
      {getDetail(part)}
    </ChatDisclosure>
  )
}
