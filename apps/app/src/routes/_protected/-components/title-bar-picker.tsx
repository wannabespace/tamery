import { UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

export const TitleBarPicker = ({
  children,
  label,
  link,
  name,
  ...props
}: Omit<ComponentProps<typeof DropdownMenu>, 'children'> & {
  /** The menu, opened only by the arrows: the name navigates. */
  children: ReactNode
  label: string
  link: ReactElement
  name: ReactNode
}) => (
  <DropdownMenu {...props}>
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
