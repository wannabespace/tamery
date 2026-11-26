import type { AppMessagePart } from '@tamery/ai/message'
import { MCP_RESULT_BYTES } from '@tamery/shared/mcp'
import { matchesSearch } from '@tamery/shared/utils'

import { getCollections } from '~/core/collections'

import type { Chat } from './sync'

const SEARCH_LIMIT = 10
const PASSAGES_PER_CHAT = 3
const PASSAGE_RADIUS = 150

const getConnection = (resourceId: string) => {
  const { connectionsCollection, connectionsResourcesCollection } =
    getCollections()
  const resource = connectionsResourcesCollection.get(resourceId)
  const connection = resource
    ? connectionsCollection.get(resource.connectionId)
    : undefined
  return resource && connection
    ? {
        connectionId: connection.id,
        name: connection.name,
        resource: resource.name,
      }
    : null
}

const getPassage = (text: string, terms: string[]) => {
  const lower = text.toLowerCase()
  const at = terms
    .map((term) => lower.indexOf(term))
    .find((index) => index !== -1)
  if (at === undefined) {
    return []
  }
  return [text.slice(Math.max(0, at - PASSAGE_RADIUS), at + PASSAGE_RADIUS)]
}

const getStatements = (part: AppMessagePart) =>
  (part.type === 'tool-query' || part.type === 'tool-execute') &&
  part.state === 'output-available'
    ? [part.input.statement]
    : []

const describe = (chat: Chat) => ({
  chatId: chat.id,
  connection: getConnection(chat.connectionResourceId),
  date: chat.updatedAt,
  title: chat.title,
})

/** The user's own chats as the agent reads them: subagents' chats and the asking chat are left out, like in the chat list. */
export const pastChats = {
  read: (chatId: string) => {
    const {
      chatsCollection,
      chatsMessagesCollection,
      chatsMessagesPartsCollection,
    } = getCollections()
    const chat = chatsCollection.get(chatId)
    if (!chat) {
      throw new Error(`No chat has the id "${chatId}".`)
    }
    const parts = Object.groupBy(
      chatsMessagesPartsCollection.toArray.toSorted(
        (a, b) => a.order - b.order
      ),
      (row) => row.messageId
    )
    const messages = chatsMessagesCollection.toArray
      .filter((message) => message.chatId === chatId)
      .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .flatMap(({ id, role }) => {
        const said = (parts[id] ?? []).map(({ part }) => part)
        const text = said
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('\n')
          .trim()
        const statements = said.flatMap(getStatements)
        return text || statements.length > 0 ? [{ role, statements, text }] : []
      })
    let budget = MCP_RESULT_BYTES
    const kept = messages.findLastIndex((message) => {
      budget -= JSON.stringify(message).length
      return budget < 0
    })
    return {
      ...describe(chat),
      messages: messages.slice(kept + 1),
      truncated: kept !== -1,
    }
  },
  search: ({ query }: { query: string }, currentChatId: string) => {
    const {
      chatsCollection,
      chatsMessagesCollection,
      chatsMessagesPartsCollection,
    } = getCollections()
    const terms = query.toLowerCase().split(/\s+/u).filter(Boolean)
    const texts = Map.groupBy(
      chatsMessagesPartsCollection.toArray.flatMap(({ messageId, part }) => {
        const chatId = chatsMessagesCollection.get(messageId)?.chatId
        return part.type === 'text' && chatId
          ? [{ chatId, text: part.text }]
          : []
      }),
      ({ chatId }) => chatId
    )
    const found = chatsCollection.toArray
      .filter((chat) => !chat.parentChatId && chat.id !== currentChatId)
      .flatMap((chat) => {
        const said = (texts.get(chat.id) ?? []).map(({ text }) => text)
        return terms.every((term) => matchesSearch(term, chat.title, ...said))
          ? [{ chat, said }]
          : []
      })
      .toSorted(
        (a, b) => b.chat.updatedAt.getTime() - a.chat.updatedAt.getTime()
      )
    return {
      chats: found.slice(0, SEARCH_LIMIT).map(({ chat, said }) => ({
        ...describe(chat),
        passages: said
          .flatMap((text) => getPassage(text, terms))
          .slice(0, PASSAGES_PER_CHAT),
      })),
      truncated: found.length > SEARCH_LIMIT,
    }
  },
}
