import { cn } from '@tamery/ui/lib/utils'
import * as React from 'react'

const MessageGroup = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="message-group"
    className={cn('flex min-w-0 flex-col gap-2', className)}
    {...props}
  />
)

const Message = ({
  className,
  align = 'start',
  ...props
}: React.ComponentProps<'div'> & { align?: 'start' | 'end' }) => (
  <div
    data-slot="message"
    data-align={align}
    className={cn(
      `group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse`,
      className
    )}
    {...props}
  />
)

const MessageAvatar = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="message-avatar"
    className={cn(
      `bg-muted flex w-fit min-w-8 shrink-0 items-center justify-center self-end overflow-hidden rounded-full group-has-data-[slot=message-footer]/message:-translate-y-8`,
      className
    )}
    {...props}
  />
)

const MessageContent = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="message-content"
    className={cn(
      `flex w-full min-w-0 flex-col gap-6 wrap-break-word select-text group-data-[align=end]/message:gap-2.5 group-data-[align=end]/message:*:data-slot:self-end`,
      className
    )}
    {...props}
  />
)

const MessageHeader = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="message-header"
    className={cn(
      `text-muted-foreground flex max-w-full min-w-0 items-center px-3 text-xs font-medium group-has-data-[variant=ghost]/message:px-0`,
      className
    )}
    {...props}
  />
)

const MessageFooter = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="message-footer"
    className={cn(
      `text-muted-foreground flex max-w-full min-w-0 items-center px-3 text-xs font-medium group-has-data-[variant=ghost]/message:px-0 group-data-[align=end]/message:justify-end`,
      className
    )}
    {...props}
  />
)

export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
}
