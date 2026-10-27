const record = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const only = (value: Record<string, unknown>, key: string) => {
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === key ? value[key] : undefined
}

const numberOf = (text: unknown) => {
  const number = Number(text)
  return Number.isSafeInteger(number) || !Number.isInteger(number)
    ? number
    : String(text)
}

const DISPLAYED: Record<string, (inner: unknown) => unknown> = {
  $date: (inner) => {
    const millis = record(inner)?.$numberLong
    return typeof inner === 'string'
      ? inner
      : new Date(Number(millis)).toISOString()
  },
  $numberDecimal: String,
  $numberDouble: Number,
  $numberInt: Number,
  $numberLong: numberOf,
  $oid: String,
}

/**
 * A top-level field as the grid shows and edits it: an ObjectId as its hex, a date as ISO text, a number as a number.
 * Nested values keep their Extended JSON, which `toShell` writes back as the same types.
 */
export const fromWire = (value: unknown) => {
  const object = record(value)
  if (!object) {
    return value
  }
  for (const [key, display] of Object.entries(DISPLAYED)) {
    const inner = only(object, key)
    if (inner !== undefined) {
      return display(inner)
    }
  }
  return value
}

const isText = (value: unknown): value is string => typeof value === 'string'

const BOOLEAN_TEXT: Record<string, boolean> = { false: false, true: true }

const STORED: Record<string, (value: unknown) => unknown> = {
  bool: (value) => (isText(value) ? (BOOLEAN_TEXT[value] ?? value) : value),
  date: (value) =>
    isText(value) || typeof value === 'number'
      ? { $date: new Date(value).toISOString() }
      : value,
  decimal: (value) => ({ $numberDecimal: String(value) }),
  double: (value) => (isText(value) ? Number(value) : value),
  int: (value) => ({ $numberInt: String(value) }),
  long: (value) => ({ $numberLong: String(value) }),
  objectId: (value) => (isText(value) ? { $oid: value } : value),
}

export const toWire = (bsonType: string, value: unknown) =>
  value === null || value === undefined || !Object.hasOwn(STORED, bsonType)
    ? value
    : (STORED[bsonType]?.(value) ?? value)

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** A fresh ObjectId's 24-hex id: a 4-byte seconds timestamp followed by 8 random bytes, enough to pre-fill an `_id` the user can keep or replace. */
export const newObjectId = () =>
  `${Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0')}${hex(crypto.getRandomValues(new Uint8Array(8)))}`
