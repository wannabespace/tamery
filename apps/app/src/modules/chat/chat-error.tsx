import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'

import { posthog } from '~/lib/posthog'
import { creditsUrl } from '~/lib/urls'

export const ChatError = ({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) => (
  <div className="shrink-0 px-3">
    <Alert variant="error">
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
      {/* fetch throws a TypeError only when the request never reached the API */}
      {error instanceof TypeError ? (
        <>
          <AlertTitle>Couldn’t reach Tamery</AlertTitle>
          <AlertDescription>
            Check your internet connection, then retry.
          </AlertDescription>
        </>
      ) : (
        <AlertTitle data-mask>{error.message}</AlertTitle>
      )}
      <AlertAction>
        {error.message === AI_BUDGET_SPENT_MESSAGE ? (
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
