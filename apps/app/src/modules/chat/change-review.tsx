import { PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatTools } from '@tamery/ai/tools'
import { Dialect } from '@tamery/shared/enums/connection-type'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { Result } from 'better-result'

import { resolveResource } from '~/core/agent/target'
import { resultGrid } from '~/core/table/result-grid'
import { plural } from '~/utils/plural'

import { DraftFooter } from './draft-footer'
import { ResultGrid } from './statement-card'
import { ToolCard, ToolCardHeader } from './tool-card'

type Change = ChatTools['propose_change']['input']['change']

/** The change as a sentence around its table's name. */
const describe = (change: Change): [string, string?] => {
  switch (change.kind) {
    case 'insert_rows': {
      return [`Insert ${plural(change.rows.length, 'row')} into`]
    }
    case 'update_rows': {
      return [`Update ${plural(change.rows.length, 'row')} in`]
    }
    case 'delete_rows': {
      return [`Delete ${plural(change.keys.length, 'row')} from`]
    }
    case 'create_table': {
      return ['Create table']
    }
    case 'add_column': {
      return [`Add column ${change.column.name} to`]
    }
    case 'rename_column': {
      return [`Rename column ${change.column} in`, `to ${change.newName}`]
    }
    case 'drop_column': {
      return [`Drop column ${change.column} from`]
    }
    case 'rename_table': {
      return ['Rename', `to ${change.newName}`]
    }
    case 'drop_table': {
      return ['Drop table']
    }
    case 'add_index': {
      return [
        `Add ${change.unique ? 'a unique index' : 'an index'} on ${change.columns.join(', ')} to`,
      ]
    }
    default: {
      return change satisfies never
    }
  }
}

/** The rows a row change touches, as the results grid shows them. */
const changedRows = (change: Change) => {
  switch (change.kind) {
    case 'insert_rows': {
      return change.rows
    }
    case 'update_rows': {
      return change.rows.map(({ key, set }) => ({ ...key, ...set }))
    }
    case 'delete_rows': {
      return change.keys
    }
    default: {
      return []
    }
  }
}

const rowsGrid = (rows: Record<string, unknown>[]) => {
  const columns = [...new Set(rows.flatMap(Object.keys))]
  return resultGrid(
    {
      affectedRows: null,
      columns,
      rows: rows.map((row) => columns.map((column) => row[column])),
      truncated: false,
    },
    ''
  )
}

/** A drafted change: what it is, and where it waits for the user. */
export const ChangeReview = ({
  input,
  output,
}: {
  input: ChatTools['propose_change']['input']
  output: ChatTools['propose_change']['output']
}) => {
  const [before, after] = describe(input.change)
  const rows = changedRows(input.change)
  // A connection that can no longer be reached (locked, removed) has nowhere to open the draft.
  const resource = Result.try(() => resolveResource(input).resource).unwrapOr(
    null
  )

  return (
    <ToolCard>
      <ToolCardHeader
        icon={<HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />}
        title={
          <>
            {before} <InlineCode data-mask>{input.table}</InlineCode>
            {after && <span data-mask> {after}</span>}
          </>
        }
      />
      {rows.length > 0 && (
        <ResultGrid
          chart={null}
          dialect={Dialect.SQLite}
          grid={rowsGrid(rows)}
        />
      )}
      {resource && (
        <DraftFooter input={input} output={output} resourceId={resource.id} />
      )}
    </ToolCard>
  )
}
