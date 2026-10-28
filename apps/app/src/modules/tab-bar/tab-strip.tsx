import { ScrollArea } from '@tamery/ui/components/scroll-area'
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { ReactNode } from 'react'
import { useRef } from 'react'

/** The scrolling strip both tab lists share: one Tab stop, ←/→ walk its tabs. */
export const TabStrip = ({ children }: { children: ReactNode }) => {
  const stripRef = useRef<HTMLDivElement>(null)

  const focusSiblingTab = (delta: number) => {
    const tabButtons = [
      ...(stripRef.current?.querySelectorAll<HTMLElement>('[role=tab]') ?? []),
    ]
    const index = tabButtons.indexOf(document.activeElement as HTMLElement)
    tabButtons[index + delta]?.focus()
  }

  useHotkeys(
    [
      { callback: () => focusSiblingTab(-1), hotkey: 'ArrowLeft' },
      { callback: () => focusSiblingTab(1), hotkey: 'ArrowRight' },
    ],
    { target: stripRef }
  )

  return (
    <ScrollArea
      viewportProps={{ tabIndex: -1 }}
      className="h-full min-w-0 flex-1"
      viewportClassName="scroll-fade-x [--scroll-fade-mask:linear-gradient(to_top,#000_1px,transparent_1px),var(--scroll-fade-inline)] [-webkit-mask-composite:source-over]! [mask-composite:add]!"
    >
      <div ref={stripRef} className="flex h-8 w-max min-w-full items-stretch">
        {children}
        <div aria-hidden className="flex-1 border-b" />
      </div>
    </ScrollArea>
  )
}
