import {
  ArrowDown02Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  ArrowUpBigIcon,
  CommandIcon,
  CornerDownLeftIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { getOS } from '@tamery/shared/os'
import { cn } from '@tamery/ui/lib/utils'
import type { HotkeyChord } from '@tanstack/react-hotkeys'
import { parseHotkey } from '@tanstack/react-hotkeys'
import type { ComponentProps } from 'react'

import { Kbd } from '../kbd'

export const Ctrl = ({
  className,
  userAgent,
}: {
  className?: string
  userAgent: string
}) => {
  const os = getOS(userAgent)

  return os.type === 'macos' ? (
    <HugeiconsIcon
      icon={CommandIcon}
      strokeWidth={2}
      className={cn('size-3', className)}
    />
  ) : (
    'Ctrl'
  )
}

export const EnterIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon
    icon={CornerDownLeftIcon}
    strokeWidth={2}
    className={cn('size-3', className)}
  />
)

const BackspaceIcon: IconSvgElement = [
  [
    'path',
    {
      d: 'M9 5H19C20.1046 5 21 5.89543 21 7V17C21 18.1046 20.1046 19 19 19H9L2.5 12L9 5Z',
      key: '0',
      stroke: 'currentColor',
      strokeLinejoin: 'round',
      strokeWidth: '1.5',
    },
  ],
  [
    'path',
    {
      d: 'M11.5 9.5L16.5 14.5M16.5 9.5L11.5 14.5',
      key: '1',
      stroke: 'currentColor',
      strokeLinecap: 'round',
      strokeWidth: '1.5',
    },
  ],
]

const GLYPHS: Partial<Record<string, IconSvgElement>> = {
  ArrowDown: ArrowDown02Icon,
  ArrowLeft: ArrowLeft02Icon,
  ArrowRight: ArrowRight02Icon,
  ArrowUp: ArrowUp02Icon,
  Backspace: BackspaceIcon,
  Enter: CornerDownLeftIcon,
  Meta: CommandIcon,
  Shift: ArrowUpBigIcon,
}

const LABELS: Partial<Record<string, string>> = {
  Control: 'Ctrl',
  Escape: 'Esc',
}

export const KbdHotkey = ({
  hotkey,
  userAgent,
  ...props
}: ComponentProps<typeof Kbd> & { hotkey: HotkeyChord; userAgent: string }) => {
  const { code, key, modifiers } = parseHotkey(
    hotkey,
    getOS(userAgent).type === 'macos' ? 'mac' : 'windows'
  )

  return (
    <Kbd {...props}>
      {[...modifiers, key ?? code].map((part) => {
        const glyph = GLYPHS[part]
        return glyph ? (
          // A size class keeps a host's own icon size (a button's, a field's) off the glyph; the kbd still shrinks it in tooltips and menus.
          <HugeiconsIcon
            key={part}
            icon={glyph}
            strokeWidth={2}
            className="size-3"
          />
        ) : (
          <span key={part}>{LABELS[part] ?? part}</span>
        )
      })}
    </Kbd>
  )
}
