import { type } from 'arktype'

// Never a string union in a catalog read's schema: jitless ArkType builds an ArkError per missed branch, which across a
// whole database blocks the window (`architecture.md` → ArkType config ordering). Each field here is one predicate.

export const nullableString = type('unknown')
  .narrow(
    (value): value is string | null =>
      value === null || typeof value === 'string'
  )
  .describe('a string or null')

export const nullableNumber = type('unknown')
  .narrow(
    (value): value is number | null =>
      value === null || typeof value === 'number'
  )
  .describe('a number or null')

export const nullableBoolean = type('unknown')
  .narrow(
    (value): value is boolean | null =>
      value === null || typeof value === 'boolean'
  )
  .describe('a boolean or null')

export const bitFlag = type('unknown')
  .narrow(
    (value): value is boolean | 1 | 0 =>
      typeof value === 'boolean' || value === 1 || value === 0
  )
  .describe('a boolean, 1 or 0')

export const nullableFlag = type('unknown')
  .narrow(
    (value): value is boolean | number | null =>
      value === null || typeof value === 'boolean' || typeof value === 'number'
  )
  .describe('a boolean, number or null')

export const oneOf = <const T extends readonly string[]>(...values: T) => {
  const allowed = new Set<unknown>(values)
  return type('unknown').narrow((value, ctx): value is T[number] =>
    allowed.has(value) ? true : ctx.mustBe(values.join(', '))
  )
}
