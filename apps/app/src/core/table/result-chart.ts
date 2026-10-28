const MAX_BARS = 50
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-][\d:]+)?)?$/u

const isPresent = (value: unknown) => value !== null && value !== undefined

const isNumber = (value: unknown) =>
  typeof value === 'number' ||
  typeof value === 'bigint' ||
  (typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isFinite(Number(value)))

const isTime = (value: unknown) =>
  value instanceof Date || (typeof value === 'string' && ISO_DATE.test(value))

const timeLabel = (value: unknown) => {
  const iso = value instanceof Date ? value.toISOString() : String(value)
  const [date, time = ''] = iso.split(/[T ]/u)
  return /^00:00(?::00)?(?:\.0+)?(?:Z|[+-]00(?::?00)?)?$/u.test(time) || !time
    ? (date ?? iso)
    : `${date} ${time.slice(0, 5)}`
}

export interface ResultChart {
  kind: 'bar' | 'line'
  points: { x: string; y: number }[]
  x: string
  y: string
}

/** The chart a result's shape asks for: a time and a number make a line in time order, a few categories and a number make bars. Anything else has none. */
export const getResultChart = (
  columns: string[],
  rows: Record<string, unknown>[]
): ResultChart | null => {
  if (rows.length < 2) {
    return null
  }
  const holds = (column: string, test: (value: unknown) => boolean) => {
    const values = rows.map((row) => row[column]).filter(isPresent)
    return values.length > 0 && values.every(test)
  }
  const time = columns.find((column) => holds(column, isTime))
  const category = columns.find(
    (column) =>
      holds(column, (value) => typeof value === 'string') &&
      !holds(column, isNumber) &&
      !holds(column, isTime)
  )
  const x = time ?? (rows.length <= MAX_BARS ? category : undefined)
  const y = columns.find((column) => column !== x && holds(column, isNumber))
  if (!(x && y)) {
    return null
  }
  const points = rows
    .filter((row) => isPresent(row[x]) && isPresent(row[y]))
    .map((row) => ({
      x: time ? timeLabel(row[x]) : String(row[x]),
      y: Number(row[y]),
    }))
  return {
    kind: time ? 'line' : 'bar',
    points: time ? points.toSorted((a, b) => a.x.localeCompare(b.x)) : points,
    x,
    y,
  }
}
