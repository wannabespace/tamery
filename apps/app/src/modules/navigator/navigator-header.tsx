import {
  FolderAddIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  Search01Icon,
  ArrowDown01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
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
import { useParams } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ComponentProps } from 'react'
import { useDeferredValue, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import type { ShortcutId } from '~/core/keyboard/shortcuts'
import { posthog } from '~/lib/posthog'
import { startNewChat, useIsBlankChatOpen } from '~/modules/chat/open-chat'

import { createSchemaDialogRef } from './create-schema-dialog'
import { createTableDialogRef } from './create-table-dialog'
import { createViewDialogRef } from './create-view-dialog'
import { focusSearchAfter, revealNavigatorSearch } from './keyboard'
import type { NavigatorMode } from './stores'
import { getNavigatorStore, navigatorOpenValue } from './stores'
import { TablesRefresh } from './tables-refresh'

const ROLL = {
  center: { opacity: 1, transform: 'translateY(0%)' },
  enter: (direction: number) => ({
    opacity: 0,
    transform: `translateY(${direction * 100}%)`,
  }),
  exit: (direction: number) => ({
    opacity: 0,
    transform: `translateY(${direction * -100}%)`,
  }),
}

export const showNavigatorSection = (
  resourceId: string,
  section: NavigatorMode
) => {
  focusSearchAfter(() => {
    navigatorOpenValue.set(true)
    getNavigatorStore(resourceId).set(section)
  })
  posthog.capture('navigator_switched', { to: section })
}

// Keep it mounted and focusable while hidden (no conditional render, no `invisible`): it is the Navigator's keyboard home, and typing into it is what reveals it.
export const NavigatorSearchField = ({
  open,
  placeholder,
  ...props
}: Omit<ComponentProps<typeof SearchInput>, 'aria-label' | 'size' | 'start'> & {
  open: boolean
  placeholder: string
}) => (
  <div
    data-search-open={open || undefined}
    className={cn(
      'absolute top-0 right-1.5 left-2 flex h-8 items-center',
      !open && 'pointer-events-none opacity-0'
    )}
  >
    <SearchInput
      className="flex-1"
      size="sm"
      data-mask
      aria-label={placeholder}
      placeholder={placeholder}
      start={
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="text-muted-foreground/70 size-3.5"
        />
      }
      {...props}
    />
  </div>
)

export const NavigatorHeader = () => {
  const { connectionResource, dialect } = useConnectionContext()
  const { tabId } = useParams({ strict: false })
  const navigator = useSubscription(
    getNavigatorStore(connectionResource.id, tabId)
  )
  const names = useObjectNames()
  const sections = [
    {
      description: 'Browse and open your data',
      label: `${uppercaseFirst(names.table)}s`,
      shortcut: 'navigatorTables',
      value: 'tables',
    },
    {
      description: 'Indexes, constraints and the rest',
      label: 'Schema',
      shortcut: 'navigatorSchema',
      value: 'definitions',
    },
    {
      description: 'Ask AI about this database',
      label: 'Chats',
      shortcut: 'navigatorChats',
      value: 'chats',
    },
  ] as const
  const active =
    sections.find(({ value }) => value === navigator) ?? sections[0]
  // The switch commits with the shown section's list in one long synchronous render, and Motion dates an animation from the start of that render: rolling the title in its own render after it is what lets the roll be seen.
  const titledSection = useDeferredValue(navigator)
  const titled =
    sections.find(({ value }) => value === titledSection) ?? sections[0]
  const activeIndex = sections.indexOf(titled)
  const [roll, setRoll] = useState({ direction: 1, index: activeIndex })
  if (activeIndex !== roll.index) {
    setRoll({
      direction: Math.sign(activeIndex - roll.index),
      index: activeIndex,
    })
  }
  const reduceMotion = useReducedMotion()
  const isBlankChatOpen = useIsBlankChatOpen(connectionResource.id, tabId)
  const actionsBySection: Record<
    NavigatorMode,
    {
      icon: IconSvgElement
      isActive?: boolean
      label: string
      run: () => void
      shortcut?: ShortcutId
    }[]
  > = {
    chats: [
      {
        icon: PencilEdit02Icon,
        isActive: isBlankChatOpen,
        label: 'New chat',
        run: () => startNewChat(connectionResource.id),
        shortcut: 'aiChat',
      },
    ],
    definitions: [],
    tables: [
      {
        icon: PlusSignIcon,
        label: `New ${names.table}`,
        run: () => createTableDialogRef.current?.create(),
      },
      ...(isSqlDialect(dialect)
        ? [
            {
              icon: ViewIcon,
              label: 'New view',
              run: () => createViewDialogRef.current?.create(),
            },
          ]
        : []),
      ...(getCapabilities(dialect).flags.includes('schemas')
        ? [
            {
              icon: FolderAddIcon,
              label: 'New schema',
              run: () => createSchemaDialogRef.current?.create(),
            },
          ]
        : []),
    ],
  }
  const actions = actionsBySection[active.value]

  return (
    <div className="mb-3 shrink-0">
      <div className="flex h-8 items-center pl-2 group-has-[[data-active]_[data-search-open]]/navigator:invisible">
        <DropdownMenu>
          <Tooltip
            shortcut={sections.map(({ shortcut }) => (
              <ShortcutKbd key={shortcut} shortcut={shortcut} />
            ))}
          >
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={<Button variant="heading" size="sm" />}
                />
              }
            >
              <span className="relative overflow-hidden">
                <AnimatePresence
                  initial={false}
                  mode="popLayout"
                  custom={roll.direction}
                >
                  <motion.span
                    key={titled.value}
                    className="block"
                    custom={roll.direction}
                    variants={ROLL}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      duration: reduceMotion ? 0 : 0.18,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                  >
                    {titled.label}
                  </motion.span>
                </AnimatePresence>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                data-icon="inline-end"
                className="text-muted-foreground size-4 transition-transform group-aria-expanded/button:rotate-180"
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">Switch section</TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="min-w-48">
            {sections.map(({ description, label, shortcut, value }) => (
              <DropdownMenuItem
                key={value}
                onClick={() =>
                  showNavigatorSection(connectionResource.id, value)
                }
              >
                <span className="flex flex-col">
                  {label}
                  <span className="text-muted-foreground text-xs">
                    {description}
                  </span>
                </span>
                <DropdownMenuShortcut>
                  <ShortcutKbd shortcut={shortcut} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center">
          {navigator === 'tables' && <TablesRefresh />}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-sm"
                  aria-label={`Search ${active.label.toLowerCase()}`}
                  onClick={revealNavigatorSearch}
                />
              }
            >
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">Search</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {actions.length > 0 && (
        <SidebarMenu className="mt-2 pl-2 group-has-[[data-active]_[data-search-open]_input:not(:placeholder-shown)]/navigator:hidden">
          {actions.map(({ icon, isActive, label, run, shortcut }) => {
            const button = (
              <SidebarMenuButton isActive={isActive} onClick={run}>
                <HugeiconsIcon icon={icon} strokeWidth={2} />
                <span>{label}</span>
              </SidebarMenuButton>
            )
            return (
              <SidebarMenuItem key={label}>
                {shortcut ? (
                  <Tooltip shortcut={<ShortcutKbd shortcut={shortcut} />}>
                    <TooltipTrigger render={button} />
                    <TooltipContent side="right" />
                  </Tooltip>
                ) : (
                  button
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      )}
    </div>
  )
}
