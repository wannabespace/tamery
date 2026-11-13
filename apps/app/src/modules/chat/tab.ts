import { AiChat02Icon } from '@hugeicons/core-free-icons'

import type { TabKind } from '~/core/tabs/types'

export interface ChatParams {
  chatId: string
}

export const chatTabId = (chatId: string) => `chat:${chatId}`

export const chatTab: TabKind<ChatParams> = {
  icon: () => AiChat02Icon,
  match: (id) => {
    const [kind, chatId, ...extra] = id.split(':')
    return kind === 'chat' && chatId && extra.length === 0 ? { chatId } : null
  },
  title: () => 'New chat',
  type: 'chat',
}
