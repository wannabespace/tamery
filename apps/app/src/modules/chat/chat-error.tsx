import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isBudgetSpent } from '@tamery/shared/credits'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { Link } from '@tanstack/react-router'

import { posthog } from '~/lib/posthog'
import { isServerError } from '~/utils/error'

const ChatErrorText = ({ error }: { error: Error }) => {
  // fetch throws a TypeError only when the request never reached the API
  if (error instanceof TypeError) {
    return (
      <>
        <AlertTitle>Couldn’t reach Tamery</AlertTitle>
        <AlertDescription>
          Check your internet connection, then retry.
        </AlertDescription>
      </>
    )
  }
  if (isServerError(error)) {
    return (
      <>
        <AlertTitle>Tamery couldn’t answer</AlertTitle>
        <AlertDescription>
          Something went wrong on our side. Retry in a moment.
        </AlertDescription>
      </>
    )
  }
  return <AlertTitle data-mask>{error.message}</AlertTitle>
}

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
      <ChatErrorText error={error} />
      <AlertAction>
        {isBudgetSpent(error) ? (
          <Button
            size="xs"
            variant="outline"
            render={<Link to="/settings/$section" params={{ section: 'ai' }} />}
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
