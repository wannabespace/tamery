import {
  ComputerTerminal01Icon,
  KeyboardIcon,
  McpServerIcon,
  PaintBoardIcon,
  Settings02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { MachineSettings } from '~/modules/machine/machine-settings'
import { McpSettings } from '~/modules/mcp/mcp-settings'

import { AppearanceSettings } from './appearance'
import { GeneralSettings } from './general'
import { KeyboardSettings } from './keyboard'
import { WorkspaceSettings } from './workspace'

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
    component: WorkspaceSettings,
    icon: UserGroupIcon,
    label: 'Workspace',
    slug: 'workspace',
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
        component: MachineSettings,
        icon: ComputerTerminal01Icon,
        label: 'Machine',
        slug: 'machine',
      },
]
