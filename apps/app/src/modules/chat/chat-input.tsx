import { ArrowUp02Icon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { EnterIcon } from '@tamery/ui/components/custom/shortcuts'
import {
  InputGroup,
  InputGroupButton,
  InputGroupTextarea,
} from '@tamery/ui/components/input-group'
import { Kbd } from '@tamery/ui/components/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { useIsOnline } from '~/store'

import { chatOpen } from './stores'

export const ChatInput = ({
  isStreaming,
  onSend,
  onStop,
}: {
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}) => {
  const { connectionResource } = useConnectionContext()
  const isOpened = useSubscription(chatOpen(connectionResource.id))
  const isOnline = useIsOnline()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpened) {
      textareaRef.current?.focus()
    }
  }, [isOpened])

  const submit = () => {
    const text = value.trim()
    if (!text || isStreaming || !isOnline) {
      return
    }
    onSend(text)
    setValue('')
  }

  return (
    <form
      className="shrink-0 p-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <InputGroup className="relative">
        <InputGroupTextarea
          ref={textareaRef}
          data-mask
          aria-label="Message"
          placeholder="Ask about your database…"
          rows={1}
          className="field-sizing-content max-h-64 min-h-20 pb-9"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1">
          <Tooltip
            shortcut={
              !isStreaming &&
              value.trim() && (
                <Kbd>
                  <EnterIcon />
                </Kbd>
              )
            }
          >
            <TooltipTrigger
              render={
                <InputGroupButton
                  size="icon-round"
                  variant="default"
                  aria-label={isStreaming ? 'Stop generating' : 'Send message'}
                  {...(isStreaming
                    ? { onClick: onStop }
                    : { disabled: !value.trim() || !isOnline, type: 'submit' })}
                />
              }
            >
              <HugeiconsIcon
                icon={isStreaming ? StopIcon : ArrowUp02Icon}
                strokeWidth={2}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              {isStreaming ? 'Stop generating' : 'Send message'}
            </TooltipContent>
          </Tooltip>
        </div>
      </InputGroup>
    </form>
  )
}
