import { describe, expect, mock, test } from 'bun:test'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
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
    connection: {
      id: 'c',
      name: 'db',
      notes: [],
      resource: null,
      type: ConnectionType.Postgres,
    },
    key: null,
    limits: { steps: 10, tokens: 100_000 },
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

const answeredWithTools = {
  id: 'm2',
  parts: [
    { type: 'step-start' },
    {
      input: { connectionId: 'c' },
      output: { schemas: [] },
      state: 'output-available',
      toolCallId: 't1',
      type: 'tool-list_tables',
    },
  ],
  role: 'assistant',
} as AppUIMessage

const NEXT: AppUIMessage = {
  id: 'm3',
  parts: [{ text: 'and now?', type: 'text' }],
  role: 'user',
}

describe('chat step', () => {
  test('every step gets the tools the window answers', async () => {
    const { tools } = await send()
    expect(tools).toContain('execute')
  })

  test('finished tool calls stay in the transcript', async () => {
    const { contentTypes } = await send([HI, answeredWithTools, NEXT])
    expect(contentTypes).toContain('assistant:tool-call')
  })
})
