import {
  Delete02Icon,
  PencilEdit02Icon,
  PlayListAddIcon,
  Bookmark02Icon,
} from '@hugeicons/core-free-icons'
import { CommandGroup, CommandList } from '@tamery/ui/components/command'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useRouter } from '@tanstack/react-router'
import type { ComponentRef } from 'react'
import { useRef } from 'react'

import { useCollections } from '~/core/collections'
import { useTabContext } from '~/core/connection/route'

import { useRunnerActions } from '../lib/actions'
import { openRunnerTab } from '../lib/new-query'
import {
  appendQuery,
  runnerPageStore,
  setQuery,
  useRunnerPageStore,
} from '../lib/store'
import type { Query } from '../sync'
import { ActionItem, ListEmpty, PopoverCommand } from './popover-list'
import { RemoveQueryDialog } from './remove-query-dialog'

export const SavedQueries = ({ onPicked }: { onPicked: () => void }) => {
  const { connectionResource, dialect } = useTabContext()
  const { queriesCollection } = useCollections()
  const router = useRouter()
  const store = useRunnerPageStore()
  const { renameSaved } = useRunnerActions()
  const removeDialogRef = useRef<ComponentRef<typeof RemoveQueryDialog>>(null)
  const { data: queries } = useLiveQuery({
    query: (q) =>
      q
        .from({ queries: queriesCollection })
        .where(({ queries: rows }) =>
          eq(rows.connectionResourceId, connectionResource.id)
        )
        .orderBy(({ queries: rows }) => rows.createdAt, 'desc'),
  })

  const openInNewTab = (query: Query) => {
    const tabId = openRunnerTab(connectionResource.id)
    const tabStore = runnerPageStore({
      dialect,
      resourceId: connectionResource.id,
      tabId,
    })
    setQuery(tabStore, query.query)
    onPicked()
    router.navigate({
      params: { resourceId: connectionResource.id, tabId },
      to: '/connection/$resourceId/$tabId',
    })
  }

  return (
    <>
      <RemoveQueryDialog ref={removeDialogRef} />
      <PopoverCommand searchPlaceholder="Search saved queries">
        <CommandList>
          <ListEmpty icon={Bookmark02Icon}>
            {queries.length === 0
              ? 'No saved queries yet'
              : 'No matching queries'}
          </ListEmpty>
          <CommandGroup>
            {queries.map((query) => (
              <ActionItem
                key={query.id}
                value={query.id}
                keywords={[query.name, query.query]}
                onSelect={() => openInNewTab(query)}
                actions={[
                  {
                    icon: PlayListAddIcon,
                    label: 'Append to This Tab',
                    onSelect: () => {
                      appendQuery(store, query.query)
                      onPicked()
                    },
                  },
                  {
                    icon: PencilEdit02Icon,
                    label: 'Rename',
                    onSelect: () => {
                      onPicked()
                      renameSaved(query)
                    },
                  },
                  {
                    icon: Delete02Icon,
                    label: 'Delete',
                    onSelect: () => removeDialogRef.current?.remove(query),
                    variant: 'destructive',
                  },
                ]}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span data-mask className="truncate">
                    {query.name}
                  </span>
                  <span
                    data-mask
                    className="text-2xs text-muted-foreground truncate"
                  >
                    {query.query}
                  </span>
                </div>
              </ActionItem>
            ))}
          </CommandGroup>
        </CommandList>
      </PopoverCommand>
    </>
  )
}
