import { AiChat02Icon } from '@hugeicons/core-free-icons'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useSubscription } from 'seitu/react'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { chatTabs } from '~/modules/chat/chat-tabs'
import { getChatStore, openChatsValue } from '~/modules/chat/stores'
import { pressNavProps } from '~/utils/press-nav'

import { TabClose, TabIcon, tabClassName } from './tab'
import { TabStrip } from './tab-strip'

/** Agent mode's strip: one tab per open chat, plus the unsent draft while it is the active one. */
export const ChatTabStrip = () => {
  const { connectionResource } = useConnectionContext()
  const { chatsCollection } = useCollections()
  const { data: chats } = useLiveQuery({
    query: (q) =>
      q
        .from({ chats: chatsCollection })
        .where(({ chats: chat }) =>
          eq(chat.connectionResourceId, connectionResource.id)
        ),
  })
  const open = useSubscription(openChatsValue(connectionResource.id))
  const activeId = useSubscription(getChatStore(connectionResource.id))
  const tabs = activeId && open.includes(activeId) ? open : [...open, activeId]

  useShortcut('closeTab', () => {
    if (activeId) {
      chatTabs.close(connectionResource.id, activeId)
    }
  })

  return (
    <TabStrip>
      <div role="tablist" className="flex items-stretch">
        {tabs.map((id) => {
          const isActive = id === activeId
          const title =
            chats.find((chat) => chat.id === id)?.title || 'New Chat'
          return (
            <div key={id ?? 'draft'} className="relative shrink-0">
              <button
                data-mask
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                aria-label={`${title} tab`}
                className={tabClassName(isActive)}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                  })
                }
                {...pressNavProps(() =>
                  id
                    ? chatTabs.open(connectionResource.id, id)
                    : getChatStore(connectionResource.id).set(null)
                )}
              >
                <TabIcon icon={AiChat02Icon} isActive={isActive} />
                <span className="max-w-60 truncate">{title}</span>
                {id && (
                  <TabClose
                    isActive={isActive}
                    onClose={() => chatTabs.close(connectionResource.id, id)}
                  />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </TabStrip>
  )
}
