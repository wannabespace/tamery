import { UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { useLocation } from '@tanstack/react-router'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import { Link } from '~/components/link'

export const useHomeLink = () => {
  const pathname = useLocation({ select: (location) => location.pathname })
  return pathname === '/' ? undefined : <Link to="/" />
}

export const TitleBarPicker = ({
  children,
  label,
  link,
  name,
  ...props
}: Omit<ComponentProps<typeof DropdownMenu>, 'children'> & {
  children: ReactNode
  label: string
  /** Where the name leads. Without it the user is already there, so the name opens the menu rather than do nothing. */
  link?: ReactElement
  name: ReactNode
}) => (
  <DropdownMenu {...props}>
    {link ? (
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          render={link}
          // oxlint-disable-next-line shadcn/no-restyle -- title-bar pickers sit tighter than a toolbar button
          className="max-w-56 gap-1.5 px-2"
        >
          {name}
        </Button>
        <DropdownMenuTrigger
          render={
            <IconButton
              icon={UnfoldMoreIcon}
              iconClassName="size-3"
              label={label}
              side="bottom"
              size="icon-sm"
              variant="ghost-muted"
            />
          }
        />
      </div>
    ) : (
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={label}
            // oxlint-disable-next-line shadcn/no-restyle -- title-bar pickers sit tighter than a toolbar button
            className="max-w-56 gap-1.5 px-2"
          />
        }
      >
        {name}
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          strokeWidth={2}
          className="text-muted-foreground/70 size-3 shrink-0"
        />
      </DropdownMenuTrigger>
    )}
    {children}
  </DropdownMenu>
)
