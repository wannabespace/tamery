import { FlashIcon, SecurityCheckIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { InputGroupButton } from '@tamery/ui/components/input-group'
import { cn } from '@tamery/ui/lib/utils'
import { useSubscription } from 'seitu/react'

import { posthog } from '~/lib/posthog'

import type { ApprovalMode } from './stores'
import { approvalModeValue } from './stores'

const APPROVAL_MODES = {
  ask: {
    description: 'Every change waits for your Run',
    icon: SecurityCheckIcon,
    label: 'Ask',
  },
  auto: {
    description: 'Adds rows and objects on its own; edits ask',
    icon: FlashIcon,
    label: 'Auto',
  },
} satisfies Record<ApprovalMode, unknown>

/** How the agent's changes get approved; reads stay automatic in every mode. */
export const ApprovalModePicker = () => {
  const mode = useSubscription(approvalModeValue)
  const { icon, label } = APPROVAL_MODES[mode]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <InputGroupButton
            variant="ghost-muted"
            aria-label={`Approvals: ${label}`}
            className="shrink-0"
          />
        }
      >
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className={cn(mode === 'auto' && 'text-primary')}
        />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-64">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next: ApprovalMode) => {
            approvalModeValue.set(next)
            posthog.capture('ai_chat_approval_mode_changed', { mode: next })
          }}
        >
          <DropdownMenuLabel>Changes to your data</DropdownMenuLabel>
          {Object.entries(APPROVAL_MODES).map(([value, option]) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <HugeiconsIcon icon={option.icon} strokeWidth={2} />
              <span className="flex flex-col">
                {option.label}
                <span className="text-muted-foreground text-xs">
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
