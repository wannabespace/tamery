import {
  ComputerTerminal01Icon,
  KeyboardIcon,
  McpServerIcon,
  PaintBoardIcon,
  Settings02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { BridgeSettings } from '~/modules/bridge/bridge-settings'
import { McpSettings } from '~/modules/mcp/mcp-settings'

import { AppearanceSettings } from './appearance'
import { GeneralSettings } from './general'
import { KeyboardSettings } from './keyboard'
import { MembersSettings } from './members'

export const settingsSections = [
  ...(window.electron
    ? [
        {
          component: GeneralSettings,
          icon: Settings02Icon,
          label: 'General',
          slug: 'general',
        },
      ]
    : []),
  {
    component: AppearanceSettings,
    icon: PaintBoardIcon,
    label: 'Appearance',
    slug: 'appearance',
  },
  {
    component: MembersSettings,
    icon: UserGroupIcon,
    label: 'Members',
    slug: 'members',
  },
  {
    component: KeyboardSettings,
    icon: KeyboardIcon,
    label: 'Keyboard',
    slug: 'keyboard',
  },
  window.electron
    ? {
        component: McpSettings,
        icon: McpServerIcon,
        label: 'MCP',
        slug: 'mcp',
      }
    : {
        component: BridgeSettings,
        icon: ComputerTerminal01Icon,
        label: 'Bridge',
        slug: 'bridge',
      },
]
