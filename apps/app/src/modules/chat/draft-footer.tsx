import type { ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { diagramDraftsStore } from '~/core/drafts/diagram'
import { savedDrafts } from '~/core/drafts/saved'
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

const settledNote = ({
  isSaved,
  kind,
  wasStaged,
  where,
}: {
  isSaved: boolean
  kind: ChatTools['propose_change']['input']['change']['kind']
  wasStaged: boolean
  where: ChatTools['propose_change']['output']['where']
}) => {
  if (isSaved) {
    if (kind === 'delete_rows') {
      return 'Deleted'
    }
    return where === 'table' ? 'Saved' : 'Applied'
  }
  return wasStaged
    ? 'Discarded'
    : "No longer drafted; drafts don't outlive a reload"
}

/** Drafts this window has held since it loaded; one that is gone without a save was discarded, unless it went with a reload. */
const stagedThisSession = new Set<string>()

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
  const draftKey = savedDrafts.key(resourceId, output.where, { schema, table })
  const isSaved = useSubscription(savedDrafts.value, {
    selector: (keys) => keys.includes(draftKey),
  })
  useEffect(() => {
    if (isStaged) {
      stagedThisSession.add(draftKey)
    }
  }, [isStaged, draftKey])

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
          : settledNote({
              isSaved,
              kind: input.change.kind,
              wasStaged: stagedThisSession.has(draftKey),
              where: output.where,
            })}
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
