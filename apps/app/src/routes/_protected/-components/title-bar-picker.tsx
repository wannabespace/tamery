import { UnfoldMoreIcon } from '@hugeicons/core-free-icons'
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

export const resourceHomeLink = (resourceId: string) => (
  <Link
    to="/connection/$resourceId"
    params={{ resourceId }}
    search={{ home: true }}
  />
)

export const TitleBarPicker = ({
  children,
  label,
  link,
  name,
  ...props
}: Omit<ComponentProps<typeof DropdownMenu>, 'children'> & {
  children: ReactNode
  label: string
  /** The home of this level. Without it the user is already there, so the name opens the menu rather than do nothing. */
  link?: ReactElement
  name: ReactNode
}) => (
  <DropdownMenu {...props}>
    <div className="flex shrink-0 items-center">
      {link ? (
        <Button
          variant="ghost"
          size="sm"
          render={link}
          // oxlint-disable-next-line shadcn/no-restyle -- title-bar pickers sit tighter than a toolbar button
          className="max-w-56 gap-1.5 px-2"
        >
          {name}
        </Button>
      ) : (
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              // oxlint-disable-next-line shadcn/no-restyle -- title-bar pickers sit tighter than a toolbar button
              className="max-w-56 gap-1.5 px-2"
            />
          }
        >
          {name}
        </DropdownMenuTrigger>
      )}
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
    {children}
  </DropdownMenu>
)
