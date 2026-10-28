import { expect, test } from 'bun:test'

import type { AppUIMessage } from '@tamery/ai/message'

import { combineResults } from './combine'

const result = (
  toolCallId: string,
  columns: string[],
  rows: unknown[][]
): AppUIMessage['parts'][number] => ({
  input: { connectionId: 'c', resource: null, sql: 'select' },
  output: [{ affectedRows: null, columns, rows, truncated: false }],
  state: 'output-available',
  toolCallId,
  type: 'tool-query',
})

const messages: AppUIMessage[] = [
  {
    id: 'answer',
    parts: [
      result(
        'customers',
        ['id', 'name'],
        [
          [1, 'Ada'],
          [2, 'Bohdan'],
        ]
      ),
      result(
        'orders',
        ['customer_id', 'total'],
        [
          [1, 10],
          [1, 5],
          [2, 7],
        ]
      ),
    ],
    role: 'assistant',
  },
]

test('joins result sets from two queries in SQLite', async () => {
  const [set] = await combineResults(messages, {
    inputs: [
      { name: 'c', toolCallId: 'customers' },
      { name: 'o', toolCallId: 'orders' },
    ],
    sql: 'select c.name, sum(o.total) as spent from c join o on o.customer_id = c.id group by c.name order by spent desc',
  })
  expect(set?.columns).toEqual(['name', 'spent'])
  expect(set?.rows).toEqual([
    ['Ada', 15],
    ['Bohdan', 7],
  ])
})
