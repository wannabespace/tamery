import { describe, expect, mock, test } from 'bun:test'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'

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

const toolsSent = async (agent: boolean) => {
  calls.length = 0
  const stream = await streamChatStep({
    agent,
    connection: {
      id: 'c',
      name: 'db',
      notes: [],
      resource: null,
      type: ConnectionType.Postgres,
    },
    key: null,
    limits: { steps: 10, tokens: 100_000 },
    messages: [
      { id: 'm', parts: [{ text: 'hi', type: 'text' }], role: 'user' },
    ],
    onEnd: () => {},
    onError: () => 'error',
  })
  await Array.fromAsync(stream)
  return calls[0]?.tools?.map((tool) => tool.name) ?? []
}

describe('chat step', () => {
  test('a client that answers tool calls gets the tools', async () => {
    expect(await toolsSent(true)).toContain('execute')
  })

  test('an installed desktop app that cannot answer them gets none', async () => {
    expect(await toolsSent(false)).toEqual([])
  })
})
