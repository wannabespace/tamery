import { AiChat02Icon } from '@hugeicons/core-free-icons'

import type {
  CommandContext,
  CommandEntry,
} from '~/modules/actions-center/types'

import { startNewChat } from './open-chat'

export const chatCommands = ({ current }: CommandContext): CommandEntry[] =>
  current
    ? [
        {
          action: () => startNewChat(current.connectionResource.id),
          group: 'View',
          icon: AiChat02Icon,
          keywords: ['assistant', 'ai', 'agent', 'tab'],
          order: 20,
          shortcut: 'aiChat',
          value: 'New chat',
        },
      ]
    : []
