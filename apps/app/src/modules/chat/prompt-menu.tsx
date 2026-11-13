import {
  AiBrain01Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  ChatAdd01Icon,
  Copy01Icon,
  FlashIcon,
  ReloadIcon,
  SecurityCheckIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { objectEntries } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { tableTypeIcon } from '~/core/catalog/table-type'

import type {
  ChatCommand,
  PromptSuggestion,
  usePromptMentions,
} from './prompt-mentions'

const GROUPS = {
  command: 'Commands',
  connection: 'Connections',
  skill: 'Your skills',
  table: 'Tables',
} satisfies Record<PromptSuggestion['kind'], string>

const COMMAND_ICONS = {
  ask: SecurityCheckIcon,
  auto: FlashIcon,
  copy: Copy01Icon,
  model: AiBrain01Icon,
  new: ChatAdd01Icon,
  retry: ReloadIcon,
} satisfies Record<ChatCommand, unknown>

const SuggestionContent = ({
  onExpand,
  suggestion,
}: {
  onExpand: () => void
  suggestion: PromptSuggestion
}) => {
  if (suggestion.kind === 'command') {
    return (
      <>
        <HugeiconsIcon
          icon={COMMAND_ICONS[suggestion.command]}
          strokeWidth={2}
        />
        <span>/{suggestion.command}</span>
        <span className="text-muted-foreground ml-auto">
          {suggestion.label}
        </span>
      </>
    )
  }
  const { mention } = suggestion
  if (mention.kind === 'skill') {
    return (
      <>
        <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
        <span className="shrink-0">/{mention.skill.name}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {mention.skill.description}
        </span>
        <span className="text-muted-foreground/70 shrink-0">
          {mention.skill.source}
        </span>
      </>
    )
  }
  if (mention.kind === 'connection' && suggestion.isResource) {
    return (
      <>
        <ConnectionIcon type={mention.connection.type} />
        <span data-mask className="truncate">
          {mention.connection.resource}
        </span>
      </>
    )
  }
  if (mention.kind === 'connection') {
    return (
      <>
        <ConnectionIcon type={mention.connection.type} />
        <span data-mask className="truncate">
          {mention.connection.name}
        </span>
        {mention.connection.resource && (
          <span data-mask className="text-muted-foreground ml-auto truncate">
            {mention.connection.resource}
          </span>
        )}
        {suggestion.expandable && (
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label="Other resources"
            tabIndex={-1}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              onExpand()
            }}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        )}
      </>
    )
  }
  return (
    <>
      <HugeiconsIcon icon={tableTypeIcon.table} strokeWidth={2} />
      <span data-mask className="truncate">
        {mention.table.table}
      </span>
      <span data-mask className="text-muted-foreground ml-auto truncate">
        {mention.table.schema}
      </span>
    </>
  )
}

export const PromptMenu = ({
  menu,
}: {
  menu: ReturnType<typeof usePromptMentions>
}) => {
  const listRef = useRef<HTMLDivElement>(null)

  // The arrows reach the menu through the textarea, never cmdk's own keys, so cmdk never scrolls its selection into view.
  useEffect(() => {
    listRef.current
      ?.querySelector(
        `[cmdk-item][data-value="${CSS.escape(menu.highlighted)}"]`
      )
      ?.scrollIntoView({ block: 'nearest' })
  }, [menu.highlighted])

  return (
    <AnimatePresence>
      {menu.isOpen && (
        <motion.div
          key="prompt-menu"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.1 } }}
          transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
          className="bg-popover ring-foreground/4 absolute inset-x-2 bottom-full z-30 overflow-hidden rounded-xl shadow-xl ring-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          <Command
            shouldFilter={false}
            size="sm"
            value={menu.highlighted}
            onValueChange={(value) => menu.setHighlighted(value)}
          >
            <CommandList ref={listRef} aria-label="Suggestions">
              {objectEntries(
                Object.groupBy(menu.suggestions, ({ kind }) => kind)
              ).map(([kind, items]) => (
                <CommandGroup
                  key={kind}
                  heading={
                    menu.expanded && kind === 'connection' ? (
                      <span className="flex items-center gap-1.5">
                        <span data-mask>{menu.expanded}</span>
                        <span className="text-muted-foreground/70">← back</span>
                      </span>
                    ) : (
                      GROUPS[kind]
                    )
                  }
                >
                  {items?.map((suggestion) => (
                    <CommandItem
                      key={suggestion.id}
                      value={suggestion.id}
                      onSelect={() => menu.pick(suggestion)}
                    >
                      <SuggestionContent
                        suggestion={suggestion}
                        onExpand={() => menu.expand(suggestion)}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
