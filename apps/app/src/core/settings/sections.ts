import {
  AiMagicIcon,
  ComputerTerminal01Icon,
  CrownIcon,
  KeyboardIcon,
  McpServerIcon,
  NoteIcon,
  PaintBoardIcon,
  Settings02Icon,
  SquareLock02Icon,
  UserCircleIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { AccountSettings } from '~/modules/account/account-settings'
import { PlanSettings } from '~/modules/account/plan-settings'
import { SecuritySettings } from '~/modules/account/security-settings'
import { MachineSettings } from '~/modules/machine/machine-settings'
import { McpSettings } from '~/modules/mcp/mcp-settings'

import { AiSettings } from './ai'
import { AppearanceSettings } from './appearance'
import { GeneralSettings } from './general'
import { KeyboardSettings } from './keyboard'
import { SchemaNotesSettings } from './schema-notes'
import { WorkspaceSettings } from './workspace'

// Listed in group order: the sidebar prints a group's label above the first of its pages. `keywords` are the page's group and row titles, which the sidebar search matches too, so keep them in step with the page.
export const settingsSections = [
  {
    component: AccountSettings,
    group: 'Account',
    icon: UserCircleIcon,
    label: 'Account',
    needsAccount: true,
    keywords: [
      'Sessions',
      'Sign out other devices',
      'Devices',
      'Delete account',
    ],
    slug: 'account',
  },
  {
    component: PlanSettings,
    group: 'Account',
    icon: CrownIcon,
    label: 'Plan',
    needsAccount: true,
    keywords: [
      'Pro',
      'Free',
      'Subscription',
      'Upgrade',
      'Billing',
      'Billing period',
      'Payment method',
      'Invoices',
      'Free trial',
      'Cancel',
    ],
    slug: 'plan',
  },
  {
    component: SecuritySettings,
    group: 'Account',
    icon: SquareLock02Icon,
    label: 'Security',
    needsAccount: true,
    keywords: [
      'Sign-in methods',
      'Email',
      'Passkeys',
      'Google',
      'GitHub',
      'Two-factor authentication',
      '2FA',
      'Authenticator app',
      'Backup codes',
    ],
    slug: 'security',
  },
  {
    component: AiSettings,
    group: 'Account',
    icon: AiMagicIcon,
    label: 'AI',
    keywords: [
      'Your own key',
      'API key',
      'Provider',
      'Anthropic',
      'OpenAI',
      'Google',
      'OpenRouter',
      'Dictation model',
      'AI credits',
      'Add credits',
      'Auto top-up',
      'Usage',
      'Tokens',
    ],
    slug: 'ai',
  },
  ...(window.electron
    ? [
        {
          component: GeneralSettings,
          group: 'App',
          icon: Settings02Icon,
          label: 'General',
          keywords: ['Start at login', 'Open database links in Tamery'],
          slug: 'general',
        },
      ]
    : []),
  {
    component: AppearanceSettings,
    group: 'App',
    icon: PaintBoardIcon,
    label: 'Appearance',
    keywords: [
      'Theme',
      'Dark mode',
      'Light mode',
      'Transparent background',
      'App icon',
    ],
    slug: 'appearance',
  },
  {
    component: KeyboardSettings,
    group: 'App',
    icon: KeyboardIcon,
    label: 'Keyboard',
    keywords: ['Shortcuts', 'Shortcut hints', 'Hotkeys'],
    slug: 'keyboard',
  },
  ...(window.electron
    ? [
        {
          component: McpSettings,
          group: 'App',
          icon: McpServerIcon,
          label: 'MCP',
          keywords: [
            'Run MCP server',
            'Agents',
            'Clients',
            'Claude Code',
            'Cursor',
            'Activity',
            'Access',
          ],
          slug: 'mcp',
        },
      ]
    : []),
  {
    component: MachineSettings,
    group: 'App',
    icon: ComputerTerminal01Icon,
    label: 'Machines',
    keywords: [
      'This computer',
      'Your machines',
      'Connect by URL',
      'Machine URL',
      'Tamery CLI',
    ],
    slug: 'machines',
  },
  {
    component: WorkspaceSettings,
    group: 'Workspace',
    icon: UserGroupIcon,
    label: 'Workspace',
    keywords: [
      'Members',
      'Invite',
      'Invitations',
      'Roles',
      'Rename workspace',
      'Leave workspace',
    ],
    slug: 'workspace',
  },
  {
    component: SchemaNotesSettings,
    group: 'Workspace',
    icon: NoteIcon,
    label: 'Schema notes',
    keywords: ['Notes', 'AI context'],
    slug: 'schema-notes',
  },
]
