import { PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatTools } from '@tamery/ai/tools'
import { Dialect } from '@tamery/shared/enums/connection-type'
import { Button } from '@tamery/ui/components/button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { useRouter } from '@tanstack/react-router'

import { resolveResource } from '~/core/agent/target'
import { resultGrid } from '~/core/table/result-grid'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { posthog } from '~/lib/posthog'
import { VISUALIZER_TAB_ID } from '~/modules/visualizer/lib/tab'
import { plural } from '~/utils/plural'

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

/** A drafted change waits in the table's or the visualizer's own review; this says what it is and takes the user there. */
export const ChangeReview = ({
  input,
  output,
}: {
  input: ChatTools['propose_change']['input']
  output: ChatTools['propose_change']['output']
}) => {
  const router = useRouter()
  const [before, after] = describe(input.change)
  const rows = changedRows(input.change)

  const review = () => {
    const { resource } = resolveResource(input)
    const tabId =
      output.where === 'table'
        ? tableTabId(input.schema, input.table)
        : VISUALIZER_TAB_ID
    openTab(resource.id, tabId)
    posthog.capture('ai_chat_change_reviewed', { where: output.where })
    void router.navigate({
      params: { resourceId: resource.id, tabId },
      to: '/connection/$resourceId/$tabId',
    })
  }

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
        status="Draft"
      />
      {rows.length > 0 && (
        <ResultGrid
          chart={null}
          dialect={Dialect.SQLite}
          grid={rowsGrid(rows)}
        />
      )}
      <div className="flex items-center gap-1.5 p-2">
        <span className="text-muted-foreground mr-auto pl-1 text-xs">
          {output.where === 'table'
            ? 'Nothing changes until you save the draft in the table'
            : 'Nothing changes until you apply the draft in the visualizer'}
        </span>
        <Button size="xs" onClick={review}>
          Open draft
        </Button>
      </div>
    </ToolCard>
  )
}
