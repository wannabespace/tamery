import { expect, mock, test } from 'bun:test'

import { Chat } from '@ai-sdk/react'
import type { AppUIMessage } from '@tamery/ai/message'
import type { UIMessageChunk } from 'ai'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'

const run = mock(() =>
  Promise.resolve([
    { affectedRows: 1, columns: [], rows: [], truncated: false },
  ])
)
const sent: AppUIMessage[][] = []

mock.module('~/core/agent/database', () => ({
  agentDatabase: { prepareWrite: () => Promise.resolve({ run }) },
}))
mock.module('~/lib/posthog', () => ({ posthog: { capture: () => {} } }))

const { chatToolRuns } = await import('./chat-tools')

const input = {
  connectionId: 'connection',
  resource: null,
  sql: "update orders set status = 'shipped' where id = 1042",
}

const answer: UIMessageChunk[] = [
  { type: 'start' },
  { type: 'start-step' },
  { id: 'text', type: 'text-start' },
  { delta: 'Shipped.', id: 'text', type: 'text-delta' },
  { id: 'text', type: 'text-end' },
  { type: 'finish-step' },
  { type: 'finish' },
]

const transcript: AppUIMessage[] = [
  {
    id: 'question',
    parts: [{ text: 'Ship order 1042', type: 'text' }],
    role: 'user',
  },
  {
    id: 'answer',
    parts: [
      { type: 'step-start' },
      {
        input,
        state: 'input-available',
        toolCallId: 'call',
        type: 'tool-execute',
      },
    ],
    role: 'assistant',
  },
]

test('Run on a change left pending before a reload runs it once and sends the answer back', async () => {
  const chat = new Chat<AppUIMessage>({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: ({ messages }) => {
        sent.push(messages)
        return Promise.resolve(
          new ReadableStream<UIMessageChunk>({
            start: (controller) => {
              for (const chunk of answer) {
                controller.enqueue(chunk)
              }
              controller.close()
            },
          })
        )
      },
    },
  })

  const decide = () =>
    chatToolRuns.write({
      approved: true,
      chat,
      input,
      toolCallId: 'call',
      transcript,
    })
  await Promise.all([decide(), decide()])
  await decide()
  await Bun.sleep(0)

  expect(run).toHaveBeenCalledTimes(1)
  expect(sent).toHaveLength(1)
  expect(sent[0]?.at(-1)?.parts.at(-1)).toMatchObject({
    output: [{ affectedRows: 1 }],
    state: 'output-available',
    toolCallId: 'call',
  })
})
