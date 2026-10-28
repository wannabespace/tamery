import { PauseIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert,
  AlertAction,
  AlertDescription,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'

export const ChatPaused = ({
  className,
  onContinue,
}: {
  className?: string
  onContinue: () => void
}) => (
  <div className={cn('shrink-0 px-2', className)}>
    <Alert>
      <HugeiconsIcon icon={PauseIcon} strokeWidth={2} />
      <AlertDescription>
        The agent paused at this message&apos;s step limit.
      </AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline" onClick={onContinue}>
          Continue
        </Button>
      </AlertAction>
    </Alert>
  </div>
)
