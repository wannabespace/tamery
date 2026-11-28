import { describe, expect, mock, test } from 'bun:test'

import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'

import type { AppUIMessage } from '../message'

const calls: Parameters<MockLanguageModelV4['doStream']>[0][] = []
const model = new MockLanguageModelV4({
  doStream: (options) => {
    calls.push(options)
    return Promise.resolve({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          finishReason: { raw: 'stop', unified: 'stop' },
          type: 'finish',
          usage: {
            inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
            outputTokens: { reasoning: 0, text: 1, total: 1 },
          },
        },
      ]),
    })
  },
})

mock.module('../models/own-key', () => ({ chatModelFor: () => model }))
const { streamChatStep } = await import('./chat-step')

const HI: AppUIMessage = {
  id: 'm1',
  parts: [{ text: 'hi', type: 'text' }],
  role: 'user',
}

const send = async (messages: AppUIMessage[] = [HI]) => {
  calls.length = 0
  const stream = await streamChatStep({
    key: 'tamery',
    messages,
    onEnd: () => {},
    onError: () => 'error',
  })
  await Array.fromAsync(stream)
  const [call] = calls
  return {
    contentTypes: (call?.prompt ?? []).flatMap((message) =>
      typeof message.content === 'string'
        ? [message.role]
        : message.content.map((part) => `${message.role}:${part.type}`)
    ),
    tools: call?.tools?.map((tool) => tool.name) ?? [],
  }
}

describe('chat step', () => {
  test('offers no tools, since no window answers them yet', async () => {
    const { contentTypes, tools } = await send()
    expect(tools).toEqual([])
    expect(contentTypes).toEqual(['system', 'user:text'])
  })
})
