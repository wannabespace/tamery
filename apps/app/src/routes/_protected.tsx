import { silently } from '@tamery/shared/utils'
import { cn } from '@tamery/ui/lib/utils'
import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { PermixProvider } from 'permix/react'
import { useEffect } from 'react'

import { EventsProvider } from '~/components/events-provider'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { useDropQueriesOnMachineChange } from '~/core/runtime/machine/pairing'
import {
  loadPermissions,
  permix,
  usePermissionsSync,
} from '~/core/user/permissions'
import { subscriptionsQueryOptions } from '~/core/user/use-subscription'
import { useConnectionStringsSync } from '~/hooks/use-connection-strings-sync'
import { useLastOpenedResourcesSync } from '~/hooks/use-last-opened-resources-sync'
import { queryClient } from '~/lib/query-client'
import { ActionsCenter } from '~/modules/actions-center/actions-center'
import { useConnectionLinks } from '~/modules/connection-links/use-connection-links'
import { CopyDatabaseDialog } from '~/modules/copy-database/copy-database-dialog'
import { GlobalBanner } from '~/modules/global-banner/global-banner'
import { HostKeyDialog } from '~/modules/machine/host-key-dialog'
import { McpHost } from '~/modules/mcp/mcp-host'
import { SubscriptionModal } from '~/modules/subscription/subscription-modal'

import { ProtectedTitleBar } from './_protected/-components/protected-titlebar'
import { WorkspaceInvitationDialog } from './_protected/-components/workspace-invitation-dialog'

const ProtectedLayout = () => {
  const router = useRouter()
  usePermissionsSync()
  useConnectionStringsSync()
  useLastOpenedResourcesSync()
  useConnectionLinks()
  useDropQueriesOnMachineChange()

  useShortcut('settings', () => {
    if (!router.matchRoute({ to: '/settings' }, { fuzzy: true })) {
      void router.navigate({ to: '/settings' })
    }
  })

  useEffect(() => {
    const handleFocus = () => {
      queryClient.refetchQueries(subscriptionsQueryOptions)
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return (
    <PermixProvider permix={permix}>
      <EventsProvider>
        <ActionsCenter />
        {window.electron && <McpHost />}
        {window.electron && <CopyDatabaseDialog />}
        <HostKeyDialog />
        <SubscriptionModal />
        <WorkspaceInvitationDialog />
        <div className="flex h-full flex-col">
          <ProtectedTitleBar />
          <GlobalBanner />
          <div
            className={cn(
              'min-h-0 flex-1',
              '*:last:h-full *:last:min-h-[inherit] *:last:flex-1'
            )}
          >
            <Outlet />
          </div>
        </div>
      </EventsProvider>
    </PermixProvider>
  )
}

export const Route = createFileRoute('/_protected')({
  component: ProtectedLayout,
  beforeLoad: async ({ cause }) => {
    const [
      { getCollections, whenOfflineReady },
      { machine },
      { thisMachineQuery },
    ] = await Promise.all([
      import('~/core/collections'),
      import('~/core/runtime/machine/machine'),
      import('~/core/runtime/machine/pairing'),
    ])
    const c = getCollections()

    await Promise.all([
      whenOfflineReady(),
      c.connectionMachinesCollection.stateWhenReady(),
      c.connectionStringsCollection.stateWhenReady(),
      c.connectionsCollection.stateWhenReady(),
      c.machinesCollection.stateWhenReady(),
      c.connectionsResourcesCollection.stateWhenReady(),
      c.workspacesCollection.stateWhenReady(),
      permix.isReady() || loadPermissions(),
      window.electron && queryClient.ensureQueryData(thisMachineQuery),
    ])

    const thisMachine = queryClient.getQueryData(thisMachineQuery.queryKey)
    if (cause === 'enter' && thisMachine && !thisMachine.enabled) {
      void silently(() => machine.startThisComputer())
    }

    return { collections: c }
  },
})
