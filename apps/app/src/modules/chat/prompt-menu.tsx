import { ChatAdd01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { objectEntries } from '@tamery/shared/utils'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { AnimatePresence, motion } from 'motion/react'

import { tableTypeIcon } from '~/core/catalog/table-type'

import type { PromptSuggestion, usePromptMentions } from './prompt-mentions'

const GROUPS = {
  command: 'Commands',
  connection: 'Connections',
  table: 'Tables',
} satisfies Record<PromptSuggestion['kind'], string>

const SuggestionContent = ({
  suggestion,
}: {
  suggestion: PromptSuggestion
}) => {
  if (suggestion.kind === 'command') {
    return (
      <>
        <HugeiconsIcon icon={ChatAdd01Icon} strokeWidth={2} />
        <span>/{suggestion.command}</span>
        <span className="text-muted-foreground ml-auto">
          {suggestion.label}
        </span>
      </>
    )
  }
  const { mention } = suggestion
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
}) => (
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
          <CommandList aria-label="Suggestions">
            {objectEntries(
              Object.groupBy(menu.suggestions, ({ kind }) => kind)
            ).map(([kind, items]) => (
              <CommandGroup key={kind} heading={GROUPS[kind]}>
                {items?.map((suggestion) => (
                  <CommandItem
                    key={suggestion.id}
                    value={suggestion.id}
                    onSelect={() => menu.pick(suggestion)}
                  >
                    <SuggestionContent suggestion={suggestion} />
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
