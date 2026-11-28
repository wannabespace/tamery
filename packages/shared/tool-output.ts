import { MCP_CELL_BYTES, MCP_RESULT_BYTES } from './mcp'
import { bytesToHex } from './value-text'

const encoder = new TextEncoder()

const toJson = (_key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value)
  }
  return value
}

const capCell = (value: unknown) => {
  const json = JSON.stringify(value, toJson) ?? 'null'
  const bytes = encoder.encode(json).length
  if (bytes <= MCP_CELL_BYTES) {
    const parsed: unknown = JSON.parse(json)
    return { bytes, value: parsed }
  }
  const text = typeof value === 'string' ? value : json
  const { read } = encoder.encodeInto(text, new Uint8Array(MCP_CELL_BYTES))
  return {
    bytes: MCP_CELL_BYTES,
    value: { bytes, head: text.slice(0, read), truncated: true },
  }
}

/** What an agent gets back from a statement: JSON values only, each long value cut, and rows dropped from the end past the result's byte budget, every cut marked `truncated`. */
export const toToolOutput = <
  Set extends { rows: unknown[][]; truncated: boolean },
>(
  sets: Set[]
): Set[] => {
  let budget = MCP_RESULT_BYTES
  return sets.map((set) => {
    const rows: unknown[][] = []
    for (const row of set.rows) {
      const cells = row.map(capCell)
      budget -= cells.reduce((total, cell) => total + cell.bytes, 0)
      if (budget < 0) {
        return { ...set, rows, truncated: true }
      }
      rows.push(cells.map((cell) => cell.value))
    }
    return { ...set, rows }
  })
}
