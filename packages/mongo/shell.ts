const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u

const quote = (text: string) => JSON.stringify(text)

type Wrapper = (value: unknown) => string | null

const text = (value: unknown) => (typeof value === 'string' ? value : null)

const record = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null

const WRAPPERS: Record<string, Wrapper> = {
  $binary: (value) => {
    const binary = record(value)
    const base64 = text(binary?.base64)
    const subType = text(binary?.subType)
    return base64 === null || subType === null
      ? null
      : `BinData(${Number.parseInt(subType, 16)}, ${quote(base64)})`
  },
  $date: (value) => {
    const iso = text(value)
    if (iso !== null) {
      return `ISODate(${quote(iso)})`
    }
    const millis = text(record(value)?.$numberLong)
    return millis === null ? null : `new Date(${millis})`
  },
  $maxKey: () => 'MaxKey()',
  $minKey: () => 'MinKey()',
  $numberDecimal: (value) =>
    text(value) === null ? null : `NumberDecimal(${quote(String(value))})`,
  $numberDouble: (value) =>
    text(value) === null ? null : `Double(${quote(String(value))})`,
  $numberInt: (value) =>
    text(value) === null ? null : `NumberInt(${quote(String(value))})`,
  $numberLong: (value) =>
    text(value) === null ? null : `NumberLong(${quote(String(value))})`,
  $oid: (value) =>
    text(value) === null ? null : `ObjectId(${quote(String(value))})`,
  $regularExpression: (value) => {
    const regex = record(value)
    const pattern = text(regex?.pattern)
    return pattern === null
      ? null
      : `RegExp(${quote(pattern)}, ${quote(text(regex?.options) ?? '')})`
  },
  $timestamp: (value) => {
    const timestamp = record(value)
    return typeof timestamp?.t === 'number' && typeof timestamp.i === 'number'
      ? `Timestamp({ t: ${timestamp.t}, i: ${timestamp.i} })`
      : null
  },
  $uuid: (value) =>
    text(value) === null ? null : `UUID(${quote(String(value))})`,
}

const wrapped = (value: Record<string, unknown>) => {
  const [entry, ...rest] = Object.entries(value)
  if (!entry || rest.length > 0) {
    return null
  }
  const [key, inner] = entry
  return Object.hasOwn(WRAPPERS, key) ? (WRAPPERS[key]?.(inner) ?? null) : null
}

/**
 * Writes a value as mongosh source. Rows arrive as relaxed Extended JSON, so a value read from the database goes back
 * as the same BSON type; an `undefined` field is left out, as the driver leaves it out.
 */
export const toShell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (typeof value === 'string') {
    return quote(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'bigint') {
    return `NumberLong(${quote(String(value))})`
  }
  if (value instanceof Date) {
    return `ISODate(${quote(value.toISOString())})`
  }
  if (value instanceof RegExp) {
    return `RegExp(${quote(value.source)}, ${quote(value.flags)})`
  }
  if (Array.isArray(value)) {
    return `[${value.map(toShell).join(', ')}]`
  }
  const object = value as Record<string, unknown>
  const constructor = wrapped(object)
  if (constructor !== null) {
    return constructor
  }
  const fields = Object.entries(object)
    .filter(([, field]) => field !== undefined)
    .map(
      ([key, field]) =>
        `${IDENTIFIER.test(key) ? key : quote(key)}: ${toShell(field)}`
    )
  return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`
}
