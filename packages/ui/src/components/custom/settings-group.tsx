import { cardClass } from '@tamery/ui/components/card.utils'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  smallItemInsetClassName,
  ItemTitle,
} from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

export const SettingsGroup = ({
  children,
  title,
}: {
  children: ReactNode
  title?: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    {title && (
      <h2
        className={cn(
          smallItemInsetClassName,
          'text-muted-foreground text-xs font-medium'
        )}
      >
        {title}
      </h2>
    )}
    <div className={cn(cardClass, 'flex flex-col overflow-hidden')}>
      {children}
    </div>
  </section>
)

/** `htmlFor`: makes the whole row the control's label, for a `Switch`; leave it out for a control that opens a popup. */
export const SettingsRow = ({
  children,
  dense,
  description,
  htmlFor,
  icon,
  iconVariant,
  title,
}: {
  children?: ReactNode
  dense?: boolean
  description?: ReactNode
  htmlFor?: string
  icon?: ReactNode
  iconVariant?: 'avatar'
  title: ReactNode
}) => (
  <Item
    size="sm"
    variant="grouped"
    className={cn(dense && 'py-2')}
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- Item renders the title and description into this label
    render={htmlFor ? <label htmlFor={htmlFor} /> : undefined}
  >
    {icon && <ItemMedia variant={iconVariant}>{icon}</ItemMedia>}
    <ItemContent>
      <ItemTitle>{title}</ItemTitle>
      {description && <ItemDescription>{description}</ItemDescription>}
    </ItemContent>
    {children && <ItemActions>{children}</ItemActions>}
  </Item>
)
