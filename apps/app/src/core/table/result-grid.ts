import type { ResultSet } from '~/core/queries/connection/custom'

export const uniqueColumns = (columns: string[]) => {
  const seen = new Map<string, number>()
  return columns.map((name) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name} (${count})`
  })
}

export const resultGrid = (set: ResultSet | null, needle: string) => {
  const columns = uniqueColumns(set?.columns ?? [])
  const records = (set?.rows ?? []).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]]))
  )
  return {
    columns,
    rows: needle
      ? records.filter((row) =>
          JSON.stringify(Object.values(row)).toLowerCase().includes(needle)
        )
      : records,
  }
}
