import { ArrowLeft01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { title } from '@tamery/shared/title'
import { matchesSearch } from '@tamery/shared/utils'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@tamery/ui/components/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useHotkey } from '@tanstack/react-hotkeys'
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { Fragment, useRef, useState } from 'react'

import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { settingsSections } from '~/core/settings/sections'
import { useGoBack } from '~/hooks/use-go-back'
import { useHasAccount } from '~/lib/auth'
import { useNavigatorSearch } from '~/modules/navigator/keyboard'
import {
  resourcePanelClassName,
  settingsPageClassName,
  settingsSidebarClassName,
} from '~/shell'
import { pressNavProps } from '~/utils/press-nav'

const SettingsPage = () => {
  const { section } = useParams({ strict: false })
  const navigate = useNavigate()
  const pageRef = useRef<HTMLDivElement>(null)
  const hasAccount = useHasAccount()
  const sections = settingsSections.filter(
    ({ needsAccount }) => hasAccount || !needsAccount
  )
  const [search, setSearch] = useState('')
  const results = sections.flatMap((page) => {
    const hit = matchesSearch(search, page.label, page.group)
      ? null
      : page.keywords.find((keyword) => matchesSearch(search, keyword))
    return hit === undefined ? [] : [{ ...page, hit }]
  })
  const openSection = (slug: string) => {
    void navigate({
      params: { section: slug },
      replace: true,
      to: '/settings/$section',
    })
  }
  const { highlightedControlId, highlightedId, listId, searchProps } =
    useNavigatorSearch({
      activeId: section,
      nodes: results.map(({ slug }) => ({ id: slug })),
      onClear: () => setSearch(''),
      search,
    })

  const leave = useGoBack()

  // Scoped to the page so Escape in a portalled popup closes only the popup; the page's tabIndex keeps clicks on empty space in scope. Fields ignore it so a half-typed value is never dropped by leaving.
  useHotkey('Escape', leave, { ignoreInputs: true, target: pageRef })

  return (
    <div ref={pageRef} tabIndex={-1} className={settingsPageClassName}>
      <aside className={settingsSidebarClassName}>
        <Tooltip shortcut={<ShortcutKbd shortcut="stepBack" />}>
          <TooltipTrigger
            render={<SidebarMenuButton {...pressNavProps(leave)} />}
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              className="text-muted-foreground"
            />
            Back to app
          </TooltipTrigger>
          <TooltipContent side="right">Back to app</TooltipContent>
        </Tooltip>
        <SearchInput
          size="sm"
          placeholder="Search settings"
          aria-label="Search settings"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          onKeyDown={(event) => {
            if (
              event.key === 'Escape' &&
              !search &&
              !event.nativeEvent.isComposing
            ) {
              leave()
            }
          }}
          start={
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="text-muted-foreground/70 size-3.5"
            />
          }
          {...searchProps}
        />
        {results.length === 0 && (
          <IconEmpty
            variant="elevated"
            icon={Search01Icon}
            title="Nothing found"
            description="Search by a page or a setting on it, like Google or Theme."
          />
        )}
        <SidebarMenu id={listId}>
          {results.map(({ group, hit, icon, label, slug }, index) => (
            <Fragment key={slug}>
              {group !== results[index - 1]?.group && (
                <SidebarGroupLabel className="mt-4 first:mt-0">
                  {group}
                </SidebarGroupLabel>
              )}
              <SidebarMenuItem
                data-highlighted={slug === highlightedId || undefined}
              >
                <SidebarMenuButton
                  id={slug === highlightedId ? highlightedControlId : undefined}
                  tabIndex={-1}
                  isActive={slug === section}
                  {...pressNavProps(() => openSection(slug))}
                >
                  <HugeiconsIcon
                    icon={icon}
                    strokeWidth={2}
                    className="text-muted-foreground"
                  />
                  {label}
                  {hit && (
                    <span className="text-muted-foreground ml-auto truncate text-xs">
                      {hit}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Fragment>
          ))}
        </SidebarMenu>
      </aside>
      <div className={resourcePanelClassName}>
        <ScrollArea className="min-h-0 flex-1">
          {/* Sync the tables' outer cell padding with `smallItemInsetClassName`. */}
          <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-10 [&_:is(th,td):first-child]:pl-3.5 [&_:is(th,td):last-child]:pr-3.5">
            <h1
              className={cn(smallItemInsetClassName, 'text-xl font-semibold')}
            >
              {sections.find(({ slug }) => slug === section)?.label}
            </h1>
            <Outlet />
          </section>
        </ScrollArea>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_protected/settings')({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: title('Settings') }],
  }),
})
