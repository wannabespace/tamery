import type { IconSvgElement } from '@hugeicons/react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'

import type { ShortcutId } from '~/core/keyboard/shortcuts'

export interface AppMenuItem {
  type?: 'item'
  label: string
  onSelect: () => void
  disabled?: boolean
  variant?: 'default' | 'destructive'
  /** Native only; web styles it via `className`/`icon`. */
  checked?: boolean
  /** Native menus show its `sfSymbols` twin; an unmapped icon renders web-only. */
  icon?: IconSvgElement
  shortcut?: ShortcutId
  /** Web only. */
  trailing?: ReactNode
  nativeLabel?: string
  /** Web only. */
  className?: string
}

export interface AppMenuSeparator {
  type: 'separator'
}

export interface AppMenuLabel {
  type: 'label'
  label: string
}

export interface AppMenuGroup {
  type: 'group'
  label?: string
  items: AppMenuNode[]
}

export interface AppMenuSub {
  type: 'sub'
  label: string
  disabled?: boolean
  icon?: IconSvgElement
  items: AppMenuNode[]
}

export interface AppMenuRadioGroup {
  type: 'radio'
  value: string
  onValueChange: (value: string) => void
  options: {
    value: string
    label: string
    disabled?: boolean
    /** Web only. */
    icon?: IconSvgElement
  }[]
}

export type AppMenuNode =
  | AppMenuItem
  | AppMenuSeparator
  | AppMenuLabel
  | AppMenuGroup
  | AppMenuSub
  | AppMenuRadioGroup

export interface AppContextMenuProps {
  items: AppMenuNode[] | (() => AppMenuNode[])
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  render?: ReactElement
  className?: string
  style?: CSSProperties
  contentProps?: {
    side?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'start' | 'center' | 'end'
    className?: string
    finalFocus?: () => void
  }
}
