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
import { Button } from '@tamery/ui/components/button'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'

import { tableTypeIcon } from '~/core/catalog/table-type'

import type { ChatCommand, PromptSuggestion } from './prompt-mentions'

const COMMAND_ICONS = {
  ask: SecurityCheckIcon,
  auto: FlashIcon,
  copy: Copy01Icon,
  model: AiBrain01Icon,
  new: ChatAdd01Icon,
  retry: ReloadIcon,
} satisfies Record<ChatCommand, unknown>

export const SuggestionContent = ({
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
