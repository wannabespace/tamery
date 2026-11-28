import type { AppUIMessage } from '@tamery/ai/message'
import { textFromMessage } from '@tamery/ai/message'
import {
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@tamery/ui/components/message-scroller'
import {
  createPopoverHandle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { Response } from '@tamery/ui/components/response'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type { RefObject } from 'react'
import { useState } from 'react'

import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcuts } from '~/core/keyboard/use-shortcuts'
import { posthog } from '~/lib/posthog'

import { sqlRuns } from '../composer/sql-run'
import { MODEL_DISALLOWED_ELEMENTS } from './model-elements'

interface Turn {
  answer: string
  id: string
  messageIds: string[]
  question: string
}

const toTurns = (messages: AppUIMessage[]) => {
  const turns: Turn[] = []
  for (const message of messages) {
    const turn = turns.at(-1)
    if (message.role === 'user') {
      turns.push({
        answer: '',
        id: message.id,
        messageIds: [message.id],
        question:
          textFromMessage(message) || (sqlRuns(message)[0]?.statement ?? ''),
      })
    } else if (turn) {
      turn.messageIds.push(message.id)
      turn.answer ||= textFromMessage(message)
    }
  }
  return turns
}

/** `transcript` scopes ⌥↑ and ⌥↓ to the messages, since in the composer they move the caret. */
export const TurnRail = ({
  messages,
  transcript,
}: {
  messages: AppUIMessage[]
  transcript: RefObject<HTMLElement | null>
}) => {
  const { scrollToMessage } = useMessageScroller()
  const { end, start } = useMessageScrollerScrollable()
  const { visibleMessageIds } = useMessageScrollerVisibility()
  // oxlint-disable-next-line react/hook-use-state -- a stable handle per mount, never set
  const [preview] = useState(createPopoverHandle<Turn>)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const turns = toTurns(messages)
  const isOnScreen = (turn: Turn) =>
    turn.messageIds.some((id) => visibleMessageIds.includes(id))
  const jumpTo = (turn: Turn | undefined, via: 'keyboard' | 'rail') => {
    if (turn) {
      posthog.capture('ai_chat_turn_jumped', { via })
      scrollToMessage(turn.id, { behavior: 'smooth' })
    }
  }
  const topmost = turns.findIndex(isOnScreen)
  useShortcuts(
    [
      {
        callback: () => jumpTo(turns[topmost - 1], 'keyboard'),
        shortcut: 'chatPreviousTurn',
      },
      {
        callback: () => jumpTo(turns[topmost + 1], 'keyboard'),
        shortcut: 'chatNextTurn',
      },
    ],
    { target: transcript }
  )
  const shortcuts = (
    <>
      <ShortcutKbd shortcut="chatPreviousTurn" />
      <ShortcutKbd shortcut="chatNextTurn" />
    </>
  )
  if (turns.length < 2 || !(start || end)) {
    return null
  }

  return (
    // Sized by the scroller, not the viewport, so the rail hides where it would sit over the column's text.
    <div className="@container pointer-events-none absolute inset-0">
      <Tooltip open={isPreviewing ? false : undefined} shortcut={shortcuts}>
        {/* Holding ⌘ alone opens this tooltip: on hover it would cover the preview, which carries the shortcuts itself. */}
        <TooltipTrigger
          disabled
          render={
            <nav
              aria-label="Jump to message"
              className="pointer-events-auto absolute top-1/2 right-3 hidden max-h-[calc(100%-6rem)] -translate-y-1/2 flex-col @3xl:flex"
            />
          }
        >
          {turns.map((turn, index) => (
            <PopoverTrigger
              key={turn.id}
              handle={preview}
              payload={turn}
              openOnHover
              delay={100}
              tabIndex={-1}
              aria-label={`Go to message ${index + 1}`}
              className="group/turn flex h-3.5 min-h-1.5 w-6 shrink items-center justify-end"
              onClick={() => jumpTo(turn, 'rail')}
            >
              <span
                className={cn(
                  'bg-foreground/20 group-hover/turn:bg-foreground/50 ease-house h-1 w-3.5 rounded-full transition-[width,background-color] duration-150',
                  isOnScreen(turn) &&
                    'bg-foreground group-hover/turn:bg-foreground w-5'
                )}
              />
            </PopoverTrigger>
          ))}
          <Popover handle={preview} onOpenChange={setIsPreviewing}>
            {({ payload }) => (
              <PopoverContent side="left" detached className="max-w-72">
                {payload && (
                  <div className="flex flex-col gap-2">
                    <div data-mask className="flex flex-col gap-2">
                      <p className="line-clamp-2 whitespace-pre-wrap">
                        {payload.question}
                      </p>
                      {payload.answer && (
                        <div className="text-muted-foreground line-clamp-3">
                          <Response
                            disallowedElements={MODEL_DISALLOWED_ELEMENTS}
                          >
                            {payload.answer}
                          </Response>
                        </div>
                      )}
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      Jump to message
                      {shortcuts}
                    </div>
                  </div>
                )}
              </PopoverContent>
            )}
          </Popover>
        </TooltipTrigger>
        <TooltipContent side="top" />
      </Tooltip>
    </div>
  )
}
