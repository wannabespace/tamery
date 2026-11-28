import { PauseIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert,
  AlertAction,
  AlertDescription,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'

export const ChatPaused = ({
  by,
  onContinue,
}: {
  by: 'limit' | 'user'
  onContinue: () => void
}) => (
  <div className="shrink-0 px-3">
    <Alert>
      <HugeiconsIcon icon={PauseIcon} strokeWidth={2} />
      <AlertDescription>
        {by === 'limit'
          ? 'The agent paused at this message’s step limit.'
          : 'You stopped the agent.'}
      </AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline" onClick={onContinue}>
          Continue
        </Button>
      </AlertAction>
    </Alert>
  </div>
)
