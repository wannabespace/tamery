import type { ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { useRouter } from '@tanstack/react-router'
import { useSubscription } from 'seitu/react'

import { diagramDraftsStore } from '~/core/drafts/diagram'
import { tableSessionStore } from '~/core/table/session'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { posthog } from '~/lib/posthog'
import { VISUALIZER_TAB_ID } from '~/modules/visualizer/lib/tab'

const pendingNote = (
  kind: ChatTools['propose_change']['input']['change']['kind'],
  where: ChatTools['propose_change']['output']['where']
) => {
  if (kind === 'delete_rows') {
    return 'Nothing is deleted until you confirm it in the table'
  }
  return where === 'table'
    ? 'Nothing changes until you save the draft in the table'
    : 'Nothing changes until you apply the draft in the visualizer'
}

/** Where a drafted change waits, while the table or the visualizer still holds it: saving, discarding or a reload empties those drafts. */
export const DraftFooter = ({
  input,
  output,
  resourceId,
}: {
  input: ChatTools['propose_change']['input']
  output: ChatTools['propose_change']['output']
  resourceId: string
}) => {
  const router = useRouter()
  const { schema, table } = input
  const rowsStaged = useSubscription(
    tableSessionStore({ id: resourceId, schema, table }),
    {
      selector: (state) =>
        state.newRows.length > 0 ||
        state.deletions.length > 0 ||
        Object.keys(state.drafts).length > 0,
    }
  )
  const schemaStaged = useSubscription(diagramDraftsStore(resourceId), {
    selector: (state) =>
      state.drafts.some(
        (draft) => draft.schema === schema && draft.table === table
      ),
  })
  const isTable = output.where === 'table'
  const isStaged = isTable ? rowsStaged : schemaStaged

  const review = () => {
    const tabId = isTable ? tableTabId(schema, table) : VISUALIZER_TAB_ID
    openTab(resourceId, tabId)
    posthog.capture('ai_chat_change_reviewed', { where: output.where })
    void router.navigate({
      params: { resourceId, tabId },
      to: '/connection/$resourceId/$tabId',
    })
  }

  return (
    <div className="flex items-center gap-1.5 p-2">
      <span className="text-muted-foreground mr-auto pl-1 text-xs">
        {isStaged
          ? pendingNote(input.change.kind, output.where)
          : 'Saved or discarded'}
      </span>
      <Button
        size="xs"
        variant={isStaged ? 'default' : 'outline'}
        onClick={review}
      >
        {isStaged && 'Open draft'}
        {!isStaged && (isTable ? 'Open table' : 'Open visualizer')}
      </Button>
    </div>
  )
}
