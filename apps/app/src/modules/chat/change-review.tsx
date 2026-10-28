import type { ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { useRouter } from '@tanstack/react-router'

import { resolveResource } from '~/core/agent/target'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { posthog } from '~/lib/posthog'
import { VISUALIZER_TAB_ID } from '~/modules/visualizer/lib/tab'

import { agentModeValue } from './stores'

/** A drafted change waits in the table's or the visualizer's own review; this takes the user there. */
export const ChangeReview = ({
  input,
  output,
}: {
  input: ChatTools['propose_change']['input']
  output: ChatTools['propose_change']['output']
}) => {
  const router = useRouter()

  const review = () => {
    const { resource } = resolveResource(input)
    const tabId =
      output.where === 'table'
        ? tableTabId(input.schema, input.table)
        : VISUALIZER_TAB_ID
    openTab(resource.id, tabId)
    posthog.capture('ai_chat_change_reviewed', { where: output.where })
    agentModeValue.set(false)
    void router.navigate({
      params: { resourceId: resource.id, tabId },
      to: '/connection/$resourceId/$tabId',
    })
  }

  return (
    <div className="bg-background ring-foreground/4 flex items-center gap-1.5 rounded-xl p-2 ring">
      <span className="text-muted-foreground mr-auto pl-1 text-xs">
        {output.where === 'table'
          ? 'Drafted in the table. Nothing runs until you save it there.'
          : 'Drafted in the visualizer. Nothing runs until you apply it there.'}
      </span>
      <Button size="sm" onClick={review}>
        Review
      </Button>
    </div>
  )
}
