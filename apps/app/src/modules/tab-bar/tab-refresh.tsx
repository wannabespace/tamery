import { RefreshButton } from '@tamery/ui/components/custom/refresh-button'

import { resolveTab } from '~/core/tabs/kinds'
import { tabViews } from '~/core/tabs/views'

export const TabRefresh = ({
  resourceId,
  tabId,
}: {
  resourceId: string
  tabId: string | undefined
}) => {
  const resolved = tabId ? resolveTab(tabId, resourceId) : null
  const view = resolved && tabViews[resolved.kind.type]

  if (resolved && view?.Refresh) {
    return <view.Refresh params={resolved.params} />
  }

  return (
    <RefreshButton
      variant="ghost-muted"
      size="icon-xs"
      aria-label="Refresh"
      iconClassName="size-3.5"
      refreshing={false}
      disabled
    />
  )
}
