import {
  Cancel01Icon,
  PencilEdit01Icon,
  Undo02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useRouter } from '@tanstack/react-router'
import { Reorder } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { AppContextMenu } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import type { ConnectionResource } from '~/core/connection/sync'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { openTab, renameTab } from '~/core/tabs/actions'
import { resolveTab } from '~/core/tabs/kinds'
import type { ConnectionTab } from '~/core/tabs/types'
import { tabViews } from '~/core/tabs/views'
import { pressNavProps } from '~/utils/press-nav'

const REORDER_TRANSITION = {
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1],
} as const

export const tabClassName = (isActive: boolean) =>
  cn(
    `group text-muted-foreground hover:bg-background/50 font-row relative flex h-full cursor-default items-center gap-1.5 border-r border-b pr-8 pl-3 text-sm whitespace-nowrap transition-colors duration-40`,
    isActive &&
      `bg-background text-foreground hover:bg-background border-b-transparent`
  )

export const TabIcon = ({
  icon,
  isActive,
}: {
  icon: IconSvgElement
  isActive: boolean
}) => (
  <HugeiconsIcon
    icon={icon}
    strokeWidth={2}
    className={cn(
      'text-muted-foreground/60 size-3.5 shrink-0 transition-colors duration-40',
      isActive && 'text-primary'
    )}
  />
)

export const TabClose = ({
  isActive,
  onClose,
}: {
  isActive: boolean
  onClose: () => void
}) => (
  <Tooltip
    shortcut={
      isActive && window.electron && <ShortcutKbd shortcut="closeTab" />
    }
  >
    <TooltipTrigger
      render={
        // Nested button is invalid HTML (parent tab is already a button); the keyboard closes a tab from its ⌘. menu.
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <span
          tabIndex={-1}
          aria-label="Close tab"
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground absolute right-2 flex size-4 items-center justify-center rounded-sm opacity-0 transition-opacity duration-100 group-hover:opacity-60 hover:opacity-100! data-popup-open:opacity-100"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        />
      }
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
    </TooltipTrigger>
    <TooltipContent side="bottom">Close tab</TooltipContent>
  </Tooltip>
)

export const Tab = ({
  tab,
  label,
  defaultLabel,
  connectionResource,
  isActive,
  isTabStop,
  isDragging,
  onDragStateChange,
  onClose,
  closeItems,
}: {
  tab: ConnectionTab
  label: string
  defaultLabel: string
  isActive: boolean
  isTabStop: boolean
  isDragging: boolean
  onDragStateChange: (dragging: boolean) => void
  connectionResource: ConnectionResource
  onClose: VoidFunction
  closeItems: AppMenuNode[]
}) => {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const resolved = resolveTab(tab.id)
  const isPreview = !!tab.preview
  const isRenaming = draft !== null

  const startRename = () => {
    if (isPreview) {
      openTab(connectionResource.id, tab.id)
    }
    setDraft(label)
  }

  const commitRename = () => {
    if (draft === null) {
      return
    }

    const next = draft.trim()

    renameTab(
      connectionResource.id,
      tab.id,
      next && next !== defaultLabel ? next : null
    )
    setDraft(null)
  }

  const focusTab = () => ref.current?.querySelector('button')?.focus()

  const finishRename = (finish: () => void) => {
    flushSync(finish)
    focusTab()
  }

  useHotkeys(
    [
      {
        callback: (event) => {
          if (!event.isComposing) {
            finishRename(commitRename)
          }
        },
        hotkey: 'Enter',
      },
      {
        callback: () => finishRename(() => setDraft(null)),
        hotkey: 'Escape',
      },
    ],
    { target: renameRef }
  )

  const items: AppMenuNode[] = [
    {
      icon: PencilEdit01Icon,
      label: 'Rename',
      onSelect: startRename,
    },
    ...(tab.title
      ? [
          {
            icon: Undo02Icon,
            label: 'Reset Name',
            onSelect: () => renameTab(connectionResource.id, tab.id, null),
          },
        ]
      : []),
    { type: 'separator' },
    ...closeItems,
  ]

  useEffect(() => {
    const reveal = async () => {
      // The label font swaps in after mount and widens every tab, so a reveal before it lands leaves this tab clipped.
      await document.fonts.ready
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    if (isActive) {
      reveal()
    }
  }, [isActive])

  const prefetch = () => {
    if (resolved) {
      tabViews[resolved.kind.type]?.prefetch?.(
        connectionResource,
        resolved.params
      )
    }
  }

  const goToTab = () =>
    router.navigate({
      params: { resourceId: connectionResource.id, tabId: tab.id },
      to: '/connection/$resourceId/$tabId',
    })

  const tabClasses = cn(tabClassName(isActive), isPreview && 'italic')

  const icon = resolved && (
    <TabIcon icon={resolved.kind.icon(resolved.params)} isActive={isActive} />
  )

  if (isRenaming) {
    return (
      <Reorder.Item
        value={tab}
        as="div"
        ref={ref}
        drag={false}
        layout="position"
        transition={{ layout: { duration: 0 } }}
        className="relative shrink-0"
      >
        <div data-mask className={tabClasses}>
          {icon}
          <input
            ref={renameRef}
            autoFocus
            aria-label="Tab name"
            value={draft ?? ''}
            className="field-sizing-content min-w-4 border-none bg-transparent p-0 outline-hidden"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitRename}
          />
        </div>
      </Reorder.Item>
    )
  }

  return (
    <Reorder.Item
      value={tab}
      as="div"
      ref={ref}
      layout="position"
      transition={{ layout: isDragging ? REORDER_TRANSITION : { duration: 0 } }}
      onDragStart={() => onDragStateChange(true)}
      onDragEnd={() => onDragStateChange(false)}
      className="relative shrink-0 aria-pressed:z-10"
    >
      <AppContextMenu
        open={contextMenuOpen}
        onOpenChange={setContextMenuOpen}
        className="block h-full"
        items={items}
        contentProps={{
          finalFocus: focusTab,
        }}
      >
        <button
          data-mask
          type="button"
          role="tab"
          aria-selected={isActive}
          tabIndex={isTabStop ? 0 : -1}
          aria-label={`${label} tab`}
          className={tabClasses}
          onDoubleClick={startRename}
          onMouseOver={prefetch}
          onFocus={(event) => {
            prefetch()
            event.currentTarget.scrollIntoView({
              block: 'nearest',
              inline: 'nearest',
            })
          }}
          {...pressNavProps(goToTab)}
        >
          {icon}
          <span>{label}</span>
          <TabClose isActive={isActive} onClose={onClose} />
        </button>
      </AppContextMenu>
    </Reorder.Item>
  )
}
