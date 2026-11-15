import {
  AiMagicIcon,
  ComputerTerminal01Icon,
  KeyboardIcon,
  McpServerIcon,
  NoteIcon,
  PaintBoardIcon,
  Settings02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { BridgeSettings } from '~/modules/bridge/bridge-settings'
import { McpSettings } from '~/modules/mcp/mcp-settings'

import { AiSettings } from './ai'
import { AppearanceSettings } from './appearance'
import { GeneralSettings } from './general'
import { KeyboardSettings } from './keyboard'
import { SchemaNotesSettings } from './schema-notes'
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
  {
    component: AiSettings,
    icon: AiMagicIcon,
    label: 'AI',
    slug: 'ai',
  },
  {
    component: SchemaNotesSettings,
    icon: NoteIcon,
    label: 'Schema notes',
    slug: 'schema-notes',
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
