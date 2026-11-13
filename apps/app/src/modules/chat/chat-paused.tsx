import { PauseIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert,
  AlertAction,
  AlertDescription,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'

export const ChatPaused = ({ onContinue }: { onContinue: () => void }) => (
  <div className="shrink-0 px-2">
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
