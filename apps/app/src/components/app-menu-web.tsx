import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@tamery/ui/components/context-menu'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tamery/ui/components/dropdown-menu'
import type { ReactNode } from 'react'

import type { AppMenuNode } from '~/components/app-menu'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { isShortcutAvailable } from '~/core/keyboard/shortcuts'

const menuIcon = (icon?: IconSvgElement) =>
  icon && <HugeiconsIcon icon={icon} strokeWidth={2} />

export const contextMenuParts = {
  Group: ContextMenuGroup,
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
  Separator: ContextMenuSeparator,
  Shortcut: ContextMenuShortcut,
  Sub: ContextMenuSub,
  SubContent: ContextMenuSubContent,
  SubTrigger: ContextMenuSubTrigger,
}

export const dropdownMenuParts: typeof contextMenuParts = {
  Group: DropdownMenuGroup,
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Sub: DropdownMenuSub,
  SubContent: DropdownMenuSubContent,
  SubTrigger: DropdownMenuSubTrigger,
}

export const renderWebNodes = (
  nodes: AppMenuNode[],
  parts: typeof contextMenuParts
): ReactNode =>
  nodes.map((node, index) => {
    switch (node.type) {
      case 'separator': {
        // oxlint-disable-next-line react/no-array-index-key
        return <parts.Separator key={index} />
      }
      case 'label': {
        // Base UI's label must sit inside a group, or it throws on render.
        return (
          // oxlint-disable-next-line react/no-array-index-key
          <parts.Group key={index}>
            <parts.Label>{node.label}</parts.Label>
          </parts.Group>
        )
      }
      case 'group': {
        return (
          // oxlint-disable-next-line react/no-array-index-key
          <parts.Group key={index}>
            {node.label && <parts.Label>{node.label}</parts.Label>}
            {renderWebNodes(node.items, parts)}
          </parts.Group>
        )
      }
      case 'sub': {
        return (
          // oxlint-disable-next-line react/no-array-index-key
          <parts.Sub key={index}>
            <parts.SubTrigger disabled={node.disabled}>
              {menuIcon(node.icon)}
              {node.label}
            </parts.SubTrigger>
            <parts.SubContent>
              {renderWebNodes(node.items, parts)}
            </parts.SubContent>
          </parts.Sub>
        )
      }
      case 'radio': {
        const handleValueChange = (value: string) => {
          node.onValueChange(value)
        }
        return (
          <parts.RadioGroup
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            value={node.value}
            onValueChange={handleValueChange}
          >
            {node.options.map((option) => (
              <parts.RadioItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {menuIcon(option.icon)}
                {option.label}
              </parts.RadioItem>
            ))}
          </parts.RadioGroup>
        )
      }
      default: {
        const handleSelect = () => {
          node.onSelect()
        }
        return (
          <parts.Item
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            disabled={node.disabled}
            variant={node.variant}
            className={node.className}
            onClick={handleSelect}
          >
            {menuIcon(node.icon)}
            {node.label}
            {node.shortcut && isShortcutAvailable(node.shortcut) && (
              <parts.Shortcut>
                <ShortcutKbd shortcut={node.shortcut} />
              </parts.Shortcut>
            )}
            {node.trailing}
          </parts.Item>
        )
      }
    }
  })
