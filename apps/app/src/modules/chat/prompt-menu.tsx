import { objectEntries } from '@tamery/shared/utils'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tamery/ui/components/command'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import type { PromptSuggestion, usePromptMentions } from './prompt-mentions'
import { SuggestionContent } from './prompt-suggestion'

const GROUPS = {
  command: 'Commands',
  connection: 'Connections',
  skill: 'Your skills',
  table: 'Tables',
} satisfies Record<PromptSuggestion['kind'], string>

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
