import { AiChat01Icon, AiMagicIcon } from '@hugeicons/core-free-icons'

import type {
  CommandContext,
  CommandEntry,
} from '~/modules/actions-center/types'

import { toggleAgentMode } from './agent-mode'
import { toggleChat } from './chat-toggle'

export const chatCommands = ({ current }: CommandContext): CommandEntry[] =>
  current
    ? [
        {
          action: () => toggleChat(current.connectionResource.id),
          group: 'View',
          icon: AiChat01Icon,
          keywords: ['assistant', 'ai', 'panel'],
          order: 20,
          shortcut: 'aiChat',
          value: 'Toggle AI chat',
        },
        {
          action: toggleAgentMode,
          group: 'View',
          icon: AiMagicIcon,
          keywords: ['agent', 'ai', 'chat'],
          order: 21,
          shortcut: 'agentMode',
          value: 'Toggle agent mode',
        },
      ]
    : []
