import { AiMagicIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Toggle } from '@tamery/ui/components/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useSubscription } from 'seitu/react'

import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { useIsAnonymous } from '~/lib/auth'

import { toggleAgentMode } from './agent-mode'
import { agentModeValue } from './stores'

export const AgentModeToggle = () => {
  const isGuest = useIsAnonymous()
  const enabled = useSubscription(agentModeValue)

  useShortcut('agentMode', (event) => {
    event.preventDefault()
    toggleAgentMode()
  })

  return (
    <Tooltip shortcut={<ShortcutKbd shortcut="agentMode" />}>
      <TooltipTrigger
        render={
          <Toggle
            size="sm"
            pressed={enabled}
            aria-label="Agent mode"
            className={cn(isGuest && 'opacity-50')}
            onPressedChange={toggleAgentMode}
          />
        }
      >
        <HugeiconsIcon
          icon={AiMagicIcon}
          strokeWidth={2}
          className={cn(enabled && 'text-primary')}
        />
        Agent
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {enabled ? 'Back to tables' : 'Agent mode'}
      </TooltipContent>
    </Tooltip>
  )
}
