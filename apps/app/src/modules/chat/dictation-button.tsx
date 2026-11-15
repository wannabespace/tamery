import { Mic01Icon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { InputGroupButton } from '@tamery/ui/components/input-group'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'

import type { useDictation } from './dictation'

export const DictationButton = ({
  dictation,
}: {
  dictation: ReturnType<typeof useDictation>
}) => {
  const label = dictation.isRecording ? 'Stop dictation' : 'Dictate'
  if (dictation.isTranscribing) {
    return <Spinner className="text-muted-foreground m-1.25 size-3.5" />
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <InputGroupButton
            size="icon-round"
            variant={dictation.isRecording ? 'destructive' : 'ghost-muted'}
            aria-label={label}
            aria-pressed={dictation.isRecording}
            onClick={dictation.isRecording ? dictation.stop : dictation.start}
          />
        }
      >
        <HugeiconsIcon
          icon={dictation.isRecording ? StopIcon : Mic01Icon}
          strokeWidth={2}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
