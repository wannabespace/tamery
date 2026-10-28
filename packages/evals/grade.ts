/** One value as the comparison sees it: numbers (also numeric text, which Postgres returns for counts and sums) rounded to cents, dates as ISO text, objects as JSON. */
const normalize = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object' && value !== null) {
    return '$date' in value ? String(value.$date) : JSON.stringify(value)
  }
  const number = Number(value)
  if (value !== '' && value !== null && Number.isFinite(number)) {
    return String(Math.round(number * 100) / 100)
  }
  return String(value).trim().toLowerCase()
}

/** Every expected value is among the row's values, so extra columns (a name beside the count asked for) still match. */
const covers = (row: string[], expected: string[]) => {
  const left = [...row]
  return expected.every((value) => {
    const at = left.indexOf(value)
    if (at === -1) {
      return false
    }
    left.splice(at, 1)
    return true
  })
}

export const matches = ({
  actual,
  expected,
  ordered,
}: {
  actual: unknown[][]
  expected: unknown[][]
  ordered: boolean
}) => {
  if (actual.length !== expected.length) {
    return false
  }
  const actualRows = actual.map((row) => row.map(normalize))
  const expectedRows = expected.map((row) => row.map(normalize))
  if (ordered) {
    return expectedRows.every((row, index) =>
      covers(actualRows[index] ?? [], row)
    )
  }
  const left = [...actualRows]
  return expectedRows.every((row) => {
    const at = left.findIndex((candidate) => covers(candidate, row))
    if (at === -1) {
      return false
    }
    left.splice(at, 1)
    return true
  })
}
