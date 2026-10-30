import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CHAT_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import {
  Alert,
  AlertAction,
  AlertDescription,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'

import { posthog } from '~/lib/posthog'
import { creditsUrl } from '~/lib/urls'

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
        {error.message === CHAT_BUDGET_SPENT_MESSAGE ? (
          <Button
            size="xs"
            variant="outline"
            render={
              <a
                href={creditsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Add credits"
              />
            }
            onClick={() => posthog.capture('ai_credits_link_opened')}
          >
            Add credits
          </Button>
        ) : (
          <Button size="xs" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertAction>
    </Alert>
  </div>
)
