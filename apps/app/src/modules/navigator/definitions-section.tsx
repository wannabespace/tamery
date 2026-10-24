import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { matchesSearch } from '@tamery/shared/utils'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  SidebarContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@tamery/ui/components/sidebar'
import { useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Link } from '~/components/link'
import { useConnectionContext } from '~/core/connection/route'
import { openTab } from '~/core/tabs/actions'
import { schemaGroups } from '~/core/tabs/kinds'

import { useNavigatorSearch } from './keyboard'
import { getNavigatorStore } from './stores'

export const DefinitionsPanel = () => {
  const { connectionResource, dialect } = useConnectionContext()
  const { tabId: activeTabId } = useParams({ strict: false })
  const [search, setSearch] = useState('')

  const filtered = schemaGroups(dialect)
    .map((group) => ({
      ...group,
      items: group.items.filter(({ label }) => matchesSearch(search, label)),
    }))
    .filter((group) => group.items.length > 0)

  const { highlightedControlId, highlightedId, listId, searchProps } =
    useNavigatorSearch({
      activeId: activeTabId,
      nodes: filtered.flatMap((group) =>
        group.items.map(({ tabId }) => ({ id: tabId }))
      ),
      onBack: () => getNavigatorStore(connectionResource.id).set('tables'),
      onClear: () => setSearch(''),
      search,
    })

  useEffect(() => {
    if (highlightedId) {
      document
        .querySelector(`#${CSS.escape(highlightedControlId)}`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedControlId, highlightedId])

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 pb-1.5 pl-2">
        <SearchInput
          className="flex-1"
          size="sm"
          data-mask
          placeholder="Search"
          aria-label="Search definitions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          {...searchProps}
          start={
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="text-muted-foreground/70 size-3.5"
            />
          }
        />
      </div>
      <SidebarContent
        id={listId}
        tabIndex={-1}
        className="scroll-fade min-h-0 flex-1 gap-3 pb-2 pl-2"
      >
        {filtered.length === 0 && (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            Nothing found
          </p>
        )}
        {filtered.map((group) => (
          <SidebarMenu key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            {group.items.map(({ icon, label, tabId }) => {
              const isActive = activeTabId === tabId

              return (
                <SidebarMenuItem
                  key={tabId}
                  data-highlighted={tabId === highlightedId || undefined}
                >
                  <SidebarMenuButton
                    isActive={isActive}
                    render={
                      <Link
                        id={
                          tabId === highlightedId
                            ? highlightedControlId
                            : undefined
                        }
                        tabIndex={-1}
                        to="/connection/$resourceId/$tabId"
                        params={{
                          resourceId: connectionResource.id,
                          tabId,
                        }}
                        preload="viewport"
                        onClick={() =>
                          openTab(connectionResource.id, tabId, true)
                        }
                        onDoubleClick={() =>
                          openTab(connectionResource.id, tabId)
                        }
                      />
                    }
                  >
                    <HugeiconsIcon
                      icon={icon}
                      strokeWidth={2}
                      className="text-muted-foreground"
                    />
                    <span className="truncate">
                      <HighlightText text={label} match={search} />
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        ))}
      </SidebarContent>
    </>
  )
}
