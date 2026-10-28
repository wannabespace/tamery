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
import { cn } from '@tamery/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'

import { useIsOnline } from '~/store'

import type { PromptMention } from './prompt-mentions'
import { usePromptMentions } from './prompt-mentions'
import { PromptMenu } from './prompt-menu'

export const ChatInput = ({
  className,
  isActive,
  isStreaming,
  onCommand,
  onSend,
  onStop,
}: {
  className?: string
  /** Focuses the composer whenever it turns true. */
  isActive: boolean
  isStreaming: boolean
  onCommand: (command: 'new') => void
  onSend: (text: string, mentions: PromptMention[]) => void
  onStop: () => void
}) => {
  const isOnline = useIsOnline()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menu = usePromptMentions({ onCommand, setValue, textareaRef, value })

  useEffect(() => {
    if (isActive) {
      textareaRef.current?.focus()
    }
  }, [isActive])

  const submit = () => {
    const text = value.trim()
    if (!text || isStreaming || !isOnline) {
      return
    }
    onSend(text, menu.sentMentions())
    menu.reset()
    setValue('')
  }

  return (
    <form
      className={cn('relative shrink-0 p-2', className)}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <PromptMenu menu={menu} />
      <InputGroup className="relative">
        <InputGroupTextarea
          ref={textareaRef}
          data-mask
          aria-label="Message"
          placeholder="Ask about your data, @ to mention, / for commands"
          rows={1}
          className="field-sizing-content max-h-64 min-h-20 pb-9"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onSelect={(event) => menu.onSelect(event)}
          onKeyDown={(event) => {
            if (menu.onKeyDown(event)) {
              return
            }
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
