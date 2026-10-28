import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert,
  AlertAction,
  AlertDescription,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'

export const ChatError = ({
  className,
  error,
  onRetry,
}: {
  className?: string
  error: Error
  onRetry: () => void
}) => (
  <div className={cn('shrink-0 px-2', className)}>
    <Alert variant="destructive">
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  </div>
)
