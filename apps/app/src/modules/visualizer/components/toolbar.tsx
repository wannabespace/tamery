import {
  PlusSignIcon,
  Search01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import { InputGroupText } from '@tamery/ui/components/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { AnimatePresence, motion } from 'motion/react'
import type { RefObject } from 'react'

import type { DiagramDraft } from '~/core/drafts/diagram'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { plural } from '~/utils/plural'

import { applyConsequence } from '../lib/apply'
import { tableMatches, useDiagram } from '../lib/context'
import { isDrop } from '../lib/statements'

export const Toolbar = ({
  applying,
  drafts,
  onApply,
  onReview,
  onSchemaChange,
  onSearchChange,
  schema,
  schemas,
  search,
  searchRef,
}: {
  applying: boolean
  drafts: DiagramDraft[]
  onApply: () => void
  onReview: () => void
  onSchemaChange: (schema: string) => void
  onSearchChange: (search: string) => void
  schema: string
  schemas: string[]
  search: string
  searchRef: RefObject<HTMLInputElement | null>
}) => {
  const { actions, can, diagram, search: query } = useDiagram()
  const noMatches =
    !!query && !diagram.tables.some((table) => tableMatches(table, query))
  const consequence = applyConsequence(drafts, can.ddlRollback)

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-center">
      <div className="pointer-events-none flex w-full max-w-3xl flex-wrap items-start gap-2 *:pointer-events-auto">
        {can.schemas && schemas.length > 1 && (
          <Select value={schema} onValueChange={(v) => v && onSchemaChange(v)}>
            <SelectTrigger className="max-w-56 min-w-40">
              <div className="flex flex-1 items-center gap-2 overflow-hidden text-left">
                <span className="text-muted-foreground shrink-0">schema</span>
                <span data-mask className="truncate">
                  <SelectValue placeholder="Select schema" />
                </span>
              </div>
            </SelectTrigger>
            <SelectContent data-mask>
              {schemas.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <SearchInput
          ref={searchRef}
          className="min-w-40 flex-1"
          placeholder="Search tables and columns"
          data-mask
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onClear={() => onSearchChange('')}
          start={
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          }
          end={
            <>
              {noMatches && <InputGroupText>No matches</InputGroupText>}
              {!search && <ShortcutKbd shortcut="search" />}
            </>
          }
        />
        <AnimatePresence initial={false}>
          {drafts.length > 0 && (
            <motion.div
              key="drafts"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
              className="flex shrink-0 items-center gap-1"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Review changes"
                      onClick={onReview}
                      disabled={applying}
                    />
                  }
                >
                  <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Review changes and their SQL
                </TooltipContent>
              </Tooltip>
              <Tooltip
                shortcut={!applying && <ShortcutKbd shortcut="saveChanges" />}
              >
                <TooltipTrigger
                  render={
                    <Button
                      variant={consequence.variant}
                      onClick={onApply}
                      disabled={applying}
                    />
                  }
                >
                  <LoadingContent loading={applying}>
                    Apply ({drafts.length})
                  </LoadingContent>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {drafts.some(isDrop)
                    ? `Review ${plural(drafts.length, 'change')} before applying. `
                    : `Apply ${plural(drafts.length, 'change')} to the database. `}
                  {consequence.description}
                </TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => actions.createTable()}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Table
        </Button>
      </div>
    </div>
  )
}
