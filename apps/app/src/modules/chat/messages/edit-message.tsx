import { Button } from '@tamery/ui/components/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@tamery/ui/components/input-group'
import { useRef, useState } from 'react'

import { MentionHighlight } from '../mentions/mention-highlight'
import type { PromptMention } from '../mentions/prompt-mentions'
import { usePromptMentions } from '../mentions/prompt-mentions'
import { PromptMenu } from '../mentions/prompt-menu'

export const EditMessage = ({
  initial,
  onCancel,
  onSave,
}: {
  initial: string
  onCancel: () => void
  onSave: (text: string, mentions: PromptMention[]) => void
}) => {
  const [value, setValue] = useState(initial)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const menu = usePromptMentions({
    commands: false,
    setValue,
    textareaRef,
    value,
  })
  const save = () => {
    if (value.trim()) {
      onSave(value.trim(), menu.sentMentions())
    }
  }
  return (
    <form
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <PromptMenu menu={menu} />
      <InputGroup variant="composer">
        <div className="relative flex w-full">
          <MentionHighlight
            ref={highlightRef}
            labels={menu.sentMentions().map(({ label }) => label)}
            value={value}
          />
          <InputGroupTextarea
            ref={textareaRef}
            autoFocus
            data-mask
            aria-label="Edit message"
            className="relative field-sizing-content max-h-64 min-h-14 px-3 pt-2.5"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onScroll={(event) => {
              if (highlightRef.current) {
                highlightRef.current.scrollTop = event.currentTarget.scrollTop
              }
            }}
            onSelect={(event) => menu.onSelect(event)}
            onFocus={(event) =>
              event.target.setSelectionRange(
                event.target.value.length,
                event.target.value.length
              )
            }
            onKeyDown={(event) => {
              if (menu.onKeyDown(event)) {
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onCancel()
              } else if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                save()
              }
            }}
          />
        </div>
        <InputGroupAddon align="block-end">
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="xs" type="submit" disabled={!value.trim()}>
              Send
            </Button>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
