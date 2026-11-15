import { AiChat02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatDataParts } from '@tamery/ai/tools'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { cn } from '@tamery/ui/lib/utils'
import { and, eq, useLiveQuery } from '@tanstack/react-db'
import { Fragment } from 'react'
import type { ReactNode } from 'react'

import { Link } from '~/components/link'
import { tableTypeIcon } from '~/core/catalog/table-type'
import { useCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'

import { openChat } from './open-chat'
import { TablePeek } from './table-peek'

const CHIP =
  'bg-background text-foreground rounded-md box-decoration-clone px-1 py-0.5 transition-colors [&_svg]:mr-1 [&_svg]:inline [&_svg]:size-3.5 [&_svg]:align-[-2px]'

const CHIP_ACTION = cn(
  CHIP,
  'hover:bg-background/60 focus-visible:bg-background/60 data-popup-open:bg-background/60 cursor-default outline-none'
)

interface Mention {
  chip: (text: string) => ReactNode
  label: string
}

export const escapeRegExp = (text: string) =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&')

/** The text cut at each label, the longest first so `@db/resource` wins over `@db`. */
export const splitMentions = (text: string, labels: string[]) => {
  const sorted = [...new Set(labels)].toSorted((a, b) => b.length - a.length)
  if (sorted.length === 0) {
    return [{ isMention: false, text }]
  }
  const pattern = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'u')
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ isMention: sorted.includes(part), text: part }))
}

/** Opens the mentioned database; a plain chip once it is gone from the workspace. */
const ConnectionChip = ({
  children,
  connection,
}: {
  children: ReactNode
  connection: ChatDataParts['connection']
}) => {
  const { connectionsResourcesCollection } = useCollections()
  const { data: resource } = useLiveQuery(
    (q) =>
      q
        .from({ row: connectionsResourcesCollection })
        .where(({ row }) =>
          and(
            eq(row.connectionId, connection.connectionId),
            eq(row.name, connection.resource ?? '')
          )
        )
        .findOne(),
    [connection.connectionId, connection.resource]
  )
  if (!resource) {
    return <span className={CHIP}>{children}</span>
  }
  return (
    <Link
      to="/connection/$resourceId"
      params={{ resourceId: resource.id }}
      className={CHIP_ACTION}
      onClick={() =>
        posthog.capture('ai_chat_mention_opened', { kind: 'connection' })
      }
    >
      {children}
    </Link>
  )
}

/** Opens the mentioned chat; a plain chip once it is deleted. */
const ChatChip = ({
  children,
  chatId,
}: {
  children: ReactNode
  chatId: string
}) => {
  const { chatsCollection } = useCollections()
  const { data: chat } = useLiveQuery(
    (q) =>
      q
        .from({ row: chatsCollection })
        .where(({ row }) => eq(row.id, chatId))
        .findOne(),
    [chatId]
  )
  if (!chat) {
    return <span className={CHIP}>{children}</span>
  }
  return (
    <button
      type="button"
      className={cn(CHIP_ACTION, 'py-0')}
      onClick={() => {
        posthog.capture('ai_chat_mention_opened', { kind: 'chat' })
        openChat(chat.connectionResourceId, chat.id)
      }}
    >
      {children}
    </button>
  )
}

/** The connections and tables a sent message mentioned, under the labels the composer wrote for them. */
const messageMentions = (message: AppUIMessage): Mention[] =>
  message.parts.flatMap((part) => {
    if (part.type === 'data-connection') {
      const chip = (text: string) => (
        <ConnectionChip connection={part.data}>
          <ConnectionIcon type={part.data.type} />
          {text}
        </ConnectionChip>
      )
      return [
        { chip, label: `@${part.data.name}/${part.data.resource}` },
        { chip, label: `@${part.data.name}` },
      ]
    }
    if (part.type === 'data-chat') {
      return [
        {
          chip: (text: string) => (
            <ChatChip chatId={part.data.chatId}>
              <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
              {text}
            </ChatChip>
          ),
          label: `@${part.data.title}`,
        },
      ]
    }
    if (part.type === 'data-table') {
      const { schema, table } = part.data
      return [
        {
          chip: (text: string) => (
            <TablePeek
              target={{ schema, table, type: 'table' }}
              trigger={
                // A button is always laid out inline-block, so its line height alone matches the inline chips' padded height.
                <button type="button" className={cn(CHIP_ACTION, 'py-0')}>
                  <HugeiconsIcon icon={tableTypeIcon.table} strokeWidth={2} />
                  {text}
                </button>
              }
            />
          ),
          label: `@${table}`,
        },
      ]
    }
    return []
  })

/** A sent message's text with each mention drawn as a chip led by what it names: a database chip opens it, a table chip peeks its rows. */
export const MentionText = ({
  message,
  text,
}: {
  message: AppUIMessage
  text: string
}) => {
  const chips = new Map(
    messageMentions(message).map(({ chip, label }) => [label, chip])
  )
  return splitMentions(text, [...chips.keys()]).map((part, index) => (
    <Fragment key={index}>
      {part.isMention ? chips.get(part.text)?.(part.text.slice(1)) : part.text}
    </Fragment>
  ))
}
