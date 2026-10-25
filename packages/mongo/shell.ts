const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Extended JSON keys whose string payload becomes `Constructor("payload")`. */
const STRING_CONSTRUCTORS: Record<string, string> = {
  $numberDecimal: 'NumberDecimal',
  $numberDouble: 'Double',
  $numberInt: 'NumberInt',
  $numberLong: 'NumberLong',
  $oid: 'ObjectId',
  $uuid: 'UUID',
}

/**
 * Extended JSON keys whose payload is shaped before it becomes a constructor call. Each returns `null` when the payload
 * is not the shape it needs, so the value falls back to rendering as a plain object.
 */
const SHAPED_CONSTRUCTORS: Record<string, (inner: unknown) => string | null> = {
  $binary: (inner) => {
    if (!isRecord(inner)) {
      return null
    }
    const { base64, subType } = inner
    return typeof base64 === 'string' && typeof subType === 'string'
      ? `BinData(${Number.parseInt(subType, 16)}, ${JSON.stringify(base64)})`
      : null
  },
  $date: (inner) => {
    if (typeof inner === 'string') {
      return `ISODate(${JSON.stringify(inner)})`
    }
    const millis = isRecord(inner) ? inner.$numberLong : null
    return typeof millis === 'string' ? `new Date(${millis})` : null
  },
  $maxKey: () => 'MaxKey()',
  $minKey: () => 'MinKey()',
  $regularExpression: (inner) => {
    if (!isRecord(inner) || typeof inner.pattern !== 'string') {
      return null
    }
    const options = typeof inner.options === 'string' ? inner.options : ''
    return `RegExp(${JSON.stringify(inner.pattern)}, ${JSON.stringify(options)})`
  },
  $timestamp: (inner) =>
    isRecord(inner) &&
    typeof inner.t === 'number' &&
    typeof inner.i === 'number'
      ? `Timestamp({ t: ${inner.t}, i: ${inner.i} })`
      : null,
}

const asWrapper = (object: Record<string, unknown>): string | null => {
  const [entry, ...rest] = Object.entries(object)
  if (!entry || rest.length > 0) {
    return null
  }
  const [key, inner] = entry
  const ctor = Object.hasOwn(STRING_CONSTRUCTORS, key)
    ? STRING_CONSTRUCTORS[key]
    : null
  if (ctor) {
    return typeof inner === 'string'
      ? `${ctor}(${JSON.stringify(inner)})`
      : null
  }
  return Object.hasOwn(SHAPED_CONSTRUCTORS, key)
    ? (SHAPED_CONSTRUCTORS[key]?.(inner) ?? null)
    : null
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
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'bigint') {
    return `NumberLong(${JSON.stringify(String(value))})`
  }
  if (value instanceof Date) {
    return `ISODate(${JSON.stringify(value.toISOString())})`
  }
  if (value instanceof RegExp) {
    // Mongo regex options are i, m, s and x; a JS-only flag like `u` reaches a strict server (DocumentDB, FerretDB) as a regex it refuses.
    return `RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags.replaceAll(/[^imsx]/gu, ''))})`
  }
  if (Array.isArray(value)) {
    return `[${value.map(toShell).join(', ')}]`
  }
  if (!isRecord(value)) {
    return 'null'
  }
  const wrapper = asWrapper(value)
  if (wrapper !== null) {
    return wrapper
  }
  const fields = Object.entries(value)
    .filter(([, field]) => field !== undefined)
    .map(
      ([key, field]) =>
        `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${toShell(field)}`
    )
  return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`
}
