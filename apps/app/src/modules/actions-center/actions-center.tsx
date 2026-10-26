import {
  ComputerIcon,
  DashboardSquare01Icon,
  DatabaseAddIcon,
  DatabaseSyncIcon,
  Moon02Icon,
  Refresh01Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { getDialect } from '@tamery/shared/enums/connection-type'
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPaletteFooter,
  CommandPaletteInput,
  CommandShortcut,
  defaultFilter,
} from '@tamery/ui/components/command'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { themeStore, useResolvedTheme } from '@tamery/ui/theme-store'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { skipToken, useQuery } from '@tanstack/react-query'
import type { RegisteredRouter } from '@tanstack/react-router'
import { useParams, useRouter } from '@tanstack/react-router'
import type { ComponentRef, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { tableTypeIcon } from '~/core/catalog/table-type'
import { useCollections } from '~/core/collections'
import {
  canQueryConnection,
  prefetchConnectionResourceCore,
} from '~/core/connection/fetching'
import { ResourceLabel } from '~/core/connection/resource-label'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { useConnectionResourceLinkParams } from '~/core/connection/use-connection-resource-link-params'
import { workspaceConnections } from '~/core/connection/workspace-scope'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import type { ShortcutId } from '~/core/keyboard/shortcuts'
import { isShortcutAvailable } from '~/core/keyboard/shortcuts'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { schemaGroups } from '~/core/tabs/kinds'
import { checkOrUpgrade } from '~/core/user/permissions'
import { useActiveWorkspace } from '~/core/workspace/hooks'
import { globalHooks } from '~/lib/global-hooks'
import { posthog } from '~/lib/posthog'
import { chatCommands } from '~/modules/chat/commands'
import { copyDatabaseCommands } from '~/modules/copy-database/commands'
import { navigatorCommands } from '~/modules/navigator/commands'
import { queryLoggerCommands } from '~/modules/query-logger/commands'
import { newQueryAction } from '~/modules/runner/lib/new-query'
import { tableCommands } from '~/modules/table/commands'
import { updatesCommands } from '~/modules/updates/commands'

import { actionCenterOpen } from './action-center-open'
import { settingsCommands } from './settings-commands'
import type { CommandEntry } from './types'

const run = (action: () => void) => () => {
  actionCenterOpen.set(false)
  action()
}

const actionEntry = (
  value: string,
  keywords: string[],
  Icon: IconSvgElement,
  action: () => void,
  shortcut?: ShortcutId
) => ({
  keywords,
  node: (
    <CommandItem
      key={value}
      value={value}
      onSelect={run(() => {
        posthog.capture('command_run', { command: value })
        action()
      })}
    >
      <HugeiconsIcon icon={Icon} strokeWidth={2} />
      {value}
      {shortcut && isShortcutAvailable(shortcut) && (
        <CommandShortcut>
          <ShortcutKbd shortcut={shortcut} />
        </CommandShortcut>
      )}
    </CommandItem>
  ),
  value,
})

const connectionTitle = (
  connection: Connection,
  connectionResource: ConnectionResource
) =>
  connectionResource.name
    ? `${connection.name} - ${connectionResource.name}`
    : connection.name

const ConnectionItem = ({
  connection,
  connectionResource,
}: {
  connection: Connection
  connectionResource: ConnectionResource
}) => {
  const router = useRouter()
  const params = useConnectionResourceLinkParams(connectionResource.id)

  return (
    <CommandItem
      value={connectionTitle(connection, connectionResource)}
      onSelect={run(() => {
        prefetchConnectionResourceCore(connectionResource)
        router.navigate(params)
      })}
    >
      <ConnectionIcon
        type={connection.type}
        provider={connection.provider}
        className="size-4 shrink-0"
      />
      <span data-mask className="min-w-0 flex-1 truncate">
        {connection.name}
        <span className="text-muted-foreground">
          <ResourceLabel
            connection={connection}
            name={connectionResource.name}
            prefix=" - "
          />
        </span>
      </span>
      {connection.label && (
        <CommandShortcut data-mask>{connection.label}</CommandShortcut>
      )}
    </CommandItem>
  )
}

const openResourceTab = (
  router: RegisteredRouter,
  resourceId: string,
  tabId: string
) =>
  router.navigate({
    params: { resourceId, tabId },
    to: '/connection/$resourceId/$tabId',
  })

const tableEntries = (
  router: RegisteredRouter,
  resourceId: string,
  schemas: {
    name: string
    tables: { name: string; type: keyof typeof tableTypeIcon }[]
  }[]
) =>
  schemas.flatMap((schema) =>
    schema.tables.map((table) => {
      const value = `${schema.name}.${table.name}`
      const Icon = tableTypeIcon[table.type]

      return {
        keywords: [schema.name, table.name],
        node: (
          <CommandItem
            key={value}
            value={value}
            onSelect={run(() =>
              openResourceTab(
                router,
                resourceId,
                openTab(resourceId, tableTabId(schema.name, table.name))
              )
            )}
          >
            <HugeiconsIcon icon={Icon} strokeWidth={2} />
            <span data-mask className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground">{schema.name}.</span>
              {table.name}
            </span>
          </CommandItem>
        ),
        value,
      }
    })
  )

export const ActionsCenter = () => {
  const { connectionsCollection, connectionsResourcesCollection } =
    useCollections()
  const { resourceId, tabId } = useParams({ strict: false })
  const { data: activeWorkspace } = useActiveWorkspace()
  const { data } = useLiveQuery({
    query: (q) =>
      workspaceConnections(q, connectionsCollection, activeWorkspace)
        .innerJoin(
          { connectionResources: connectionsResourcesCollection },
          ({ connectionResources, connection }) =>
            eq(connectionResources.connectionId, connection.id)
        )
        .select(({ connection, connectionResources }) => ({
          connection,
          connectionResource: connectionResources,
        }))
        .orderBy(({ connection }) => connection.createdAt, 'desc'),
  })

  const isOpen = useSubscription(actionCenterOpen)
  const router = useRouter()
  const resolvedTheme = useResolvedTheme()
  const [search, setSearch] = useState('')
  if (!isOpen && search) {
    setSearch('')
  }
  const listRef = useRef<ComponentRef<typeof CommandList>>(null)

  useShortcut('commandPalette', (e) => {
    e.preventDefault()
    actionCenterOpen.set(!isOpen)
  })

  const current = data.find(
    ({ connectionResource }) => connectionResource.id === resourceId
  )

  const { data: tablesAndSchemas } = useQuery({
    ...(current && canQueryConnection(current.connection)
      ? resourceTablesAndSchemasQueryOptions({
          connectionResource: current.connectionResource,
        })
      : { queryFn: skipToken, queryKey: ['actions-center-tables-none'] }),
    throwOnError: false,
  })

  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  const moduleEntries = [
    ...chatCommands({ current }),
    ...copyDatabaseCommands({ current }),
    ...navigatorCommands({ current }),
    ...queryLoggerCommands({ current }),
    ...tableCommands({ current, tabId }),
    ...updatesCommands(),
  ]
  const entriesIn = (
    group: CommandEntry['group'],
    coreEntries: CommandEntry[] = []
  ) =>
    [...moduleEntries, ...coreEntries]
      .toSorted((a, b) => a.order - b.order)
      .filter((entry) => entry.group === group)
      .map((entry) =>
        actionEntry(
          entry.value,
          entry.keywords,
          entry.icon,
          entry.action,
          entry.shortcut
        )
      )

  const connections = data.map(({ connection, connectionResource }) => ({
    keywords: connection.label ? [connection.label] : undefined,
    node: (
      <ConnectionItem
        key={connectionResource.id}
        connection={connection}
        connectionResource={connectionResource}
      />
    ),
    value: connectionTitle(connection, connectionResource),
  }))

  const tables = current
    ? tableEntries(
        router,
        current.connectionResource.id,
        tablesAndSchemas?.schemas ?? []
      )
    : []

  const sections = [
    {
      entries: [
        actionEntry('Home', ['dashboard'], DashboardSquare01Icon, () =>
          router.navigate({ to: '/' })
        ),
        ...(current
          ? [
              actionEntry(
                newQueryAction.label,
                [
                  'open',
                  'go to',
                  ...newQueryAction.keywords,
                  newQueryAction.label,
                ],
                newQueryAction.icon,
                () =>
                  openResourceTab(
                    router,
                    current.connectionResource.id,
                    newQueryAction.open(current.connectionResource.id)
                  )
              ),
              ...schemaGroups(getDialect(current.connection.type)).flatMap(
                (group) =>
                  group.items.map((item) =>
                    actionEntry(
                      item.label,
                      ['open', 'go to', group.label, 'definitions'],
                      item.icon,
                      () =>
                        openResourceTab(
                          router,
                          current.connectionResource.id,
                          openTab(current.connectionResource.id, item.tabId)
                        )
                    )
                  )
              ),
            ]
          : []),
        ...entriesIn('Navigation'),
      ],
      heading: 'Navigation',
    },
    {
      entries: entriesIn(
        'Database',
        current
          ? [
              {
                action: () => globalHooks.callHook('refreshPressed'),
                group: 'Database',
                icon: DatabaseSyncIcon,
                keywords: ['reload', 'refetch', 'update'],
                order: 30,
                shortcut: 'refresh',
                value: 'Refresh data',
              },
            ]
          : []
      ),
      heading: 'Database',
    },
    { entries: entriesIn('View'), heading: 'View' },
    {
      entries: [
        actionEntry(
          `Switch to ${nextTheme} theme`,
          ['theme', 'dark', 'light', 'mode'],
          resolvedTheme === 'dark' ? Sun03Icon : Moon02Icon,
          () => themeStore.set(nextTheme)
        ),
        actionEntry(
          'Use system theme',
          ['theme', 'system', 'auto'],
          ComputerIcon,
          () => themeStore.set('system')
        ),
      ],
      heading: 'Appearance',
    },
    {
      entries: [
        ...entriesIn('Application', settingsCommands(router)),
        actionEntry(
          'Reload window',
          ['restart', 'refresh'],
          Refresh01Icon,
          () => window.location.reload()
        ),
      ],
      heading: 'Application',
    },
    {
      entries: [
        actionEntry(
          'Add new connection…',
          ['new', 'create', 'database'],
          DatabaseAddIcon,
          () =>
            checkOrUpgrade('connection.create', {
              count: connectionsCollection.size,
            }) && router.navigate({ to: '/create' })
        ),
        ...connections,
      ],
      heading: 'Connections',
    },
    ...(current && tables.length > 0
      ? [
          {
            entries: tables,
            heading: `${connectionTitle(current.connection, current.connectionResource)} Tables`,
          },
        ]
      : []),
  ]

  const results = search.trim()
    ? sections
        .flatMap((section) => section.entries)
        .map((entry) => ({
          entry,
          score: defaultFilter(entry.value, search, entry.keywords),
        }))
        .filter((result) => result.score > 0)
        .toSorted((a, b) => b.score - a.score)
    : null

  let listContent: ReactNode = sections
    .filter((section) => section.entries.length > 0)
    .map((section) => (
      <CommandGroup key={section.heading} heading={section.heading}>
        {section.entries.map((entry) => entry.node)}
      </CommandGroup>
    ))
  if (results) {
    listContent =
      results.length > 0 ? (
        <CommandGroup>
          {results.map((result) => result.entry.node)}
        </CommandGroup>
      ) : (
        <div className="py-6 text-center text-sm">No commands found.</div>
      )
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => actionCenterOpen.set(open)}
    >
      <Command
        variant="transparent"
        loop
        shouldFilter={false}
        className="min-h-0 flex-1"
      >
        <CommandPaletteInput
          placeholder="Type a command or search…"
          value={search}
          onValueChange={(value) => {
            setSearch(value)
            listRef.current?.scrollTo({ top: 0 })
          }}
        />
        <CommandList
          ref={listRef}
          className="scroll-fade max-h-none flex-1 scroll-py-2"
        >
          <div className="p-1">{listContent}</div>
        </CommandList>
      </Command>
      <CommandPaletteFooter />
    </CommandDialog>
  )
}
