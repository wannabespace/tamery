import { ArrowDown02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { MessageScroller as MessageScrollerPrimitive } from '@shadcn/react/message-scroller'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'
import * as React from 'react'

export {
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@shadcn/react/message-scroller'

const MessageScrollerProvider = (
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>
) => <MessageScrollerPrimitive.Provider {...props} />

const MessageScroller = ({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) => (
  <MessageScrollerPrimitive.Root
    data-slot="message-scroller"
    className={cn(
      `group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden`,
      className
    )}
    {...props}
  />
)

const MessageScrollerViewport = ({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) => (
  <MessageScrollerPrimitive.Viewport
    data-slot="message-scroller-viewport"
    className={cn(
      `scroll-fade-b size-full min-h-0 min-w-0 scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content outline-none`,
      className
    )}
    {...props}
  />
)

const MessageScrollerContent = ({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) => (
  <MessageScrollerPrimitive.Content
    data-slot="message-scroller-content"
    className={cn('flex h-max min-h-full flex-col gap-8', className)}
    {...props}
  />
)

const MessageScrollerItem = ({
  className,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) => (
  <MessageScrollerPrimitive.Item
    data-slot="message-scroller-item"
    scrollAnchor={scrollAnchor}
    className={cn('min-w-0 shrink-0', className)}
    {...props}
  />
)

const MessageScrollerButton = ({
  className,
  direction = 'end',
  children,
  render,
  variant = 'outline',
  size = 'icon-sm',
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) => (
  <MessageScrollerPrimitive.Button
    data-slot="message-scroller-button"
    data-direction={direction}
    data-variant={variant}
    data-size={size}
    direction={direction}
    className={cn(
      'transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[active=false]:pointer-events-none data-[active=false]:translate-y-2 data-[active=false]:opacity-0',
      className
    )}
    render={render ?? <Button variant={variant} size={size} />}
    {...props}
  >
    {children ?? (
      <>
        <HugeiconsIcon icon={ArrowDown02Icon} strokeWidth={2} />
        <span className="sr-only">
          {direction === 'end' ? 'Scroll to end' : 'Scroll to start'}
        </span>
      </>
    )}
  </MessageScrollerPrimitive.Button>
)

export {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
}
