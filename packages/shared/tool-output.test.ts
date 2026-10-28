import { expect, test } from 'bun:test'

import { MCP_CELL_BYTES, MCP_RESULT_BYTES } from './mcp'
import { toToolOutput } from './tool-output'

const set = (rows: unknown[][]) => ({
  affectedRows: null,
  columns: ['value'],
  rows,
  truncated: false,
})

test('a long value is cut to its head and marked with its full size', () => {
  const long = 'é'.repeat(MCP_CELL_BYTES)
  const [result] = toToolOutput([set([[long, 1n, new Uint8Array([1, 2])]])])

  expect(result?.rows[0]).toEqual([
    {
      bytes: MCP_CELL_BYTES * 2 + 2,
      head: 'é'.repeat(MCP_CELL_BYTES / 2),
      truncated: true,
    },
    '1',
    '0x0102',
  ])
  expect(result?.truncated).toBe(false)
})

test('rows past the byte budget are dropped and the set is marked truncated', () => {
  const cell = 'x'.repeat(MCP_CELL_BYTES - 2)
  const rows = Array.from({ length: 100 }, () => [cell])
  const [result] = toToolOutput([set(rows)])

  expect(result?.rows).toHaveLength(MCP_RESULT_BYTES / MCP_CELL_BYTES)
  expect(result?.truncated).toBe(true)
})
