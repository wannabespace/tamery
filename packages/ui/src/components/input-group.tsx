import { Button } from '@tamery/ui/components/button'
import { Input } from '@tamery/ui/components/input'
import { Textarea } from '@tamery/ui/components/textarea'
import { cn } from '@tamery/ui/lib/utils'
import type { VariantProps } from 'class-variance-authority'
import * as React from 'react'

import {
  inputGroupAddonVariants,
  inputGroupButtonVariants,
  inputGroupVariants,
} from './input-group.utils'

// oxlint-disable jsx-a11y/prefer-tag-over-role
const InputGroup = ({
  className,
  size = 'default',
  variant,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof inputGroupVariants> & {
    size?: 'default' | 'sm' | 'xs'
  }) => (
  <div
    data-slot="input-group"
    data-size={size}
    role="group"
    className={cn(inputGroupVariants({ variant }), className)}
    {...props}
  />
)

const InputGroupAddon = ({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof inputGroupAddonVariants>) => (
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
  <div
    role="group"
    data-slot="input-group-addon"
    data-align={align}
    className={cn(inputGroupAddonVariants({ align }), className)}
    onClick={(e) => {
      // React bubbles clicks out of portals, so a popover opened from the addon would hand focus to the input.
      if (
        !e.currentTarget.contains(e.target as Node) ||
        (e.target as HTMLElement).closest('button')
      ) {
        return
      }
      e.currentTarget.parentElement
        ?.querySelector<HTMLElement>('input, textarea')
        ?.focus()
    }}
    {...props}
  />
)
// oxlint-enable jsx-a11y/prefer-tag-over-role

const InputGroupButton = ({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size' | 'type'> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: 'button' | 'submit' | 'reset'
  }) => (
  <Button
    type={type}
    variant={variant}
    className={cn(inputGroupButtonVariants({ size }), className)}
    {...props}
  />
)

const InputGroupText = ({
  className,
  ...props
}: React.ComponentProps<'span'>) => (
  <span
    className={cn(
      `text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4`,
      className
    )}
    {...props}
  />
)

const InputGroupInput = ({
  className,
  ...props
}: React.ComponentProps<'input'>) => (
  <Input
    data-slot="input-group-control"
    className={cn(
      `flex-1 rounded-[inherit] border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 aria-invalid:ring-0`,
      className
    )}
    {...props}
  />
)

const InputGroupTextarea = ({
  className,
  ...props
}: React.ComponentProps<'textarea'>) => (
  <Textarea
    data-slot="input-group-control"
    className={cn(
      `flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 aria-invalid:ring-0`,
      className
    )}
    {...props}
  />
)

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
}
