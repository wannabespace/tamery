import { UnavailableIcon } from '@hugeicons/core-free-icons'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { title } from '@tamery/shared/title'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import {
  ResizableGroup,
  ResizableSeparator,
  ResizablePanel,
} from '@tamery/ui/components/custom/resizable'
import {
  createFileRoute,
  getRouteApi,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useDeferredValue, useEffect } from 'react'
import { useSubscription } from 'seitu/react'

import { getDefaultSchema } from '~/core/catalog/capabilities'
import {
  prefetchConnectionResourceCore,
  useFetchingConfig,
} from '~/core/connection/fetching'
import { FetchingReason } from '~/core/connection/fetching-reason'
import {
  lastOpenedResourcesStorageValue,
  MAX_REMEMBERED_RESOURCES,
} from '~/core/connection/last-opened-resources'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { workspaceSelection } from '~/core/workspace/utils'
import { useGoBack } from '~/hooks/use-go-back'
import type { Panel } from '~/lib/panels'
import { panelSize, useShellLayout } from '~/lib/panels'
import { AgentView } from '~/modules/chat/agent-view'
import { ChatList } from '~/modules/chat/chat-list'
import { ModeSwap } from '~/modules/chat/mode-swap'
import { chatPanel } from '~/modules/chat/panel'
import { agentModeValue } from '~/modules/chat/stores'
import { useEscapeToNavigator } from '~/modules/navigator/keyboard'
import { Navigator } from '~/modules/navigator/navigator'
import { navigatorPanel } from '~/modules/navigator/panel'
import { toggleNavigator } from '~/modules/navigator/stores'
import { toggleLogger } from '~/modules/query-logger/logger-open'
import { queryLoggerPanel } from '~/modules/query-logger/panel'
import { TransactionTabGuard } from '~/modules/runner/components/transaction-tab-guard'
import { TabBar } from '~/modules/tab-bar/tab-bar'
import { resourcePanelClassName } from '~/shell'

import { ConnectionError } from './-components/connection-error'
import { UnlockForm } from './-components/unlock-form'

const { useRouteContext } = getRouteApi('/_protected/connection/$resourceId')

const REGION_MOTION = {
  bottom: {
    animate: { translateY: '0' },
    initial: { translateY: '100%' },
  },
  left: {
    animate: { scale: 1 },
    className: 'origin-left',
    initial: { scale: 0.85 },
  },
  right: {
    animate: { translateX: '0' },
    initial: { translateX: '100%' },
  },
}

const RegionPanel = ({
  children,
  hidden = false,
  panel,
  resourceId,
}: {
  /** Replaces the panel's own content. */
  children?: ReactNode
  /** Collapses the panel without forgetting whether the user had it open. */
  hidden?: boolean
  panel: Panel
  resourceId: string
}) => {
  const openValue = panel.open(resourceId)
  const sizeValue = panelSize(panel)
  const opened = useSubscription(openValue)
  const size = useSubscription(sizeValue)
  const { Component } = panel
  const separator = (
    <ResizableSeparator key="separator" aria-label={`Resize ${panel.label}`} />
  )
  const content = (
    <ResizablePanel
      key="panel"
      size={size}
      onSizeChange={(next) => sizeValue.set(next)}
      defaultSize={panel.defaultSize}
      minSize={panel.minSize}
      maxSize={panel.maxSize}
      collapsed={!opened || hidden}
      onCollapsedChange={(collapsed) => !hidden && openValue.set(!collapsed)}
      {...REGION_MOTION[panel.region]}
    >
      {children ?? <Component />}
    </ResizablePanel>
  )

  return panel.region === 'left' ? [content, separator] : [separator, content]
}

const ResourcePage = () => {
  const { connection, connectionResource } = useRouteContext()
  const goBack = useGoBack()

  useShellLayout(connectionResource.id)

  useEffect(() => {
    const last = lastOpenedResourcesStorageValue.get()
    if (last[0] !== connectionResource.id) {
      lastOpenedResourcesStorageValue.set(
        [
          connectionResource.id,
          ...last.filter((resourceId) => resourceId !== connectionResource.id),
        ].slice(0, MAX_REMEMBERED_RESOURCES)
      )
    }
  }, [connectionResource.id])

  const isAgentMode = useDeferredValue(useSubscription(agentModeValue))
  const fetching = useFetchingConfig(connection)
  const needsDetails = fetching.type === 'waiting-for-details'
  const locked = fetching.type === 'waiting-for-password' || needsDetails

  useShortcut('toggleNavigator', toggleNavigator, { enabled: !locked })
  useShortcut('queryLogger', () => toggleLogger(connectionResource.id), {
    enabled: !locked,
  })
  useEscapeToNavigator(!locked)

  if (locked) {
    return <UnlockForm scope={needsDetails ? 'details' : 'credentials'} />
  }

  if (!fetching.canSend && fetching.reason) {
    return (
      <div className="flex h-screen min-h-[inherit] flex-col">
        <IconEmpty
          icon={UnavailableIcon}
          title="Can't open this connection here"
          description={<FetchingReason reason={fetching.reason} />}
        >
          <Button variant="outline" onClick={goBack}>
            Back
          </Button>
        </IconEmpty>
      </div>
    )
  }

  return (
    <ResizableGroup orientation="horizontal" className="p-2">
      <RegionPanel panel={navigatorPanel} resourceId={connectionResource.id}>
        <ModeSwap isAgentMode={isAgentMode}>
          {isAgentMode ? <ChatList /> : <Navigator />}
        </ModeSwap>
      </RegionPanel>
      <ResizablePanel className="flex flex-col">
        <ResizableGroup orientation="vertical">
          <ResizablePanel className="flex flex-col">
            <div className={resourcePanelClassName}>
              <TabBar isAgentMode={isAgentMode} />
              <ModeSwap isAgentMode={isAgentMode}>
                {isAgentMode ? <AgentView /> : <Outlet />}
              </ModeSwap>
              <TransactionTabGuard />
            </div>
          </ResizablePanel>
          <RegionPanel
            panel={queryLoggerPanel}
            resourceId={connectionResource.id}
          />
        </ResizableGroup>
      </ResizablePanel>
      <RegionPanel
        panel={chatPanel}
        resourceId={connectionResource.id}
        hidden={isAgentMode}
      />
    </ResizableGroup>
  )
}

export const Route = createFileRoute('/_protected/connection/$resourceId')({
  component: ResourcePage,
  errorComponent: ConnectionError,
  beforeLoad: async ({ context, params }) => {
    const {
      connectionsCollection,
      connectionsResourcesCollection,
      connectionStringsCollection,
      workspacesCollection,
    } = context.collections

    let connectionResource = connectionsResourcesCollection.get(
      params.resourceId
    )
    let connection = connectionResource
      ? connectionsCollection.get(connectionResource.connectionId)
      : undefined

    if (!(connectionResource && connection)) {
      await Promise.all([
        connectionsResourcesCollection.utils.whenSynced(),
        connectionsCollection.utils.whenSynced(),
      ])

      connectionResource = connectionsResourcesCollection.get(params.resourceId)
      connection = connectionResource
        ? connectionsCollection.get(connectionResource.connectionId)
        : undefined
    }

    if (!(connectionResource && connection)) {
      lastOpenedResourcesStorageValue.set((prev) =>
        prev.filter((id) => id !== params.resourceId)
      )
      throw redirect({ to: '/' })
    }

    const activeWorkspace = workspaceSelection.current(
      workspacesCollection.toArray
    )

    if (activeWorkspace && connection.workspaceId !== activeWorkspace.id) {
      throw redirect({ to: '/' })
    }

    const dialect = getDialect(connection.type)

    return {
      connection,
      connectionResource,
      defaultSchema: getDefaultSchema(dialect, {
        loginSchema:
          connectionStringsCollection.get(connection.id)?.defaultSchema ?? null,
        resourceName: connectionResource.name,
      }),
      dialect,
    }
  },
  loader: ({ context }) => {
    prefetchConnectionResourceCore(context.connectionResource)

    return {
      connection: context.connection,
      connectionResource: context.connectionResource,
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: title(
              loaderData.connection.name,
              loaderData.connectionResource.name
            ),
          },
        ]
      : [],
  }),
})
