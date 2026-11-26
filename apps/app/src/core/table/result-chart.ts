const MAX_BARS = 50
const MAX_LABEL_LENGTH = 40
const ID_COLUMN = /(?:^|_)id$/iu
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

/** The chart a result's shape asks for: a time and a number make a line in time order, a few categories and a number make bars. Bars label by the short text column that tells rows apart best, and plot the first number that is not an id. Anything else has none. */
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
  const distinct = (column: string) =>
    new Set(
      rows
        .map((row) => row[column])
        .filter(isPresent)
        .map(String)
    ).size
  const time = columns.find((column) => holds(column, isTime))
  const [category] = columns
    .filter(
      (column) =>
        holds(
          column,
          (value) =>
            typeof value === 'string' && value.length <= MAX_LABEL_LENGTH
        ) &&
        !holds(column, isNumber) &&
        !holds(column, isTime) &&
        distinct(column) > 1
    )
    .toSorted((a, b) => distinct(b) - distinct(a))
  const x = time ?? (rows.length <= MAX_BARS ? category : undefined)
  const numbers = columns.filter(
    (column) => column !== x && holds(column, isNumber)
  )
  const y = numbers.find((column) => !ID_COLUMN.test(column)) ?? numbers[0]
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
