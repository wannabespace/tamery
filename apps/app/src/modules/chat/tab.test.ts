import { beforeEach, expect, mock, test } from 'bun:test'

let newChatIds: Record<string, string> = {}
mock.module('~/core/collections', () => ({
  getCollections: () => ({ chatsCollection: new Map() }),
}))
mock.module('./list/rename-chat', () => ({ renameChat: () => {} }))
mock.module('./stores', () => ({
  newChatIdsValue: { get: () => newChatIds },
  setNewChatId: (resourceId: string, chatId: string) => {
    newChatIds = { ...newChatIds, [resourceId]: chatId }
  },
}))

const { chatTab, chatTabId, newChatTabId } = await import('./tab')

beforeEach(() => {
  newChatIds = {}
})

test('a saved chat tab names its chat', () => {
  expect(chatTab.match(chatTabId('saved'), 'resource')).toStrictEqual({
    chatId: 'saved',
  })
})

test("the new chat tab names the resource's unsent chat, which stays out of the tab id", () => {
  newChatIds = { resource: 'unsent' }
  expect(newChatTabId).toBe('chat')
  expect(chatTab.match(newChatTabId, 'resource')).toStrictEqual({
    chatId: 'unsent',
  })
})

test('the new chat tab keeps one id per resource until activating it stores that id', () => {
  const { chatId } = chatTab.match(newChatTabId, 'resource') ?? { chatId: '' }
  expect(chatId).not.toBe('')
  expect(chatTab.match(newChatTabId, 'resource')).toStrictEqual({ chatId })
  expect(chatTab.match(newChatTabId, 'other')).not.toStrictEqual({ chatId })

  chatTab.onActivate?.('resource', { chatId })
  expect(newChatIds).toStrictEqual({ resource: chatId })
})
