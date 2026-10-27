import { Result } from 'better-result'

import type { MethodEffect } from './methods'
import { getEffect, parseScript } from './parse'

const effectsIn = (text: string) =>
  Result.try(() => parseScript(text))
    .unwrapOr([])
    .map((call) => ({ effect: getEffect(call), method: call.method }))

const DESTRUCTIVE = new Set<MethodEffect>(['command', 'drop', 'write'])
const CATALOG = new Set<MethodEffect>(['command', 'create', 'drop'])
const DATA = new Set<MethodEffect>(['command', 'insert', 'write'])

/** Additive calls (inserts, new collections and indexes) are left out, as SQL's check leaves out INSERT and CREATE. */
export const destructiveMethods = (text: string) => [
  ...new Set(
    effectsIn(text)
      .filter(({ effect }) => DESTRUCTIVE.has(effect))
      .map(({ method }) => method)
  ),
]

export const invalidatesCatalog = (text: string) =>
  effectsIn(text).some(({ effect }) => CATALOG.has(effect))

export const writesData = (text: string) =>
  effectsIn(text).some(({ effect }) => DATA.has(effect))

/** Text that does not parse is not read-only: nothing proves what it would run. */
export const readsOnly = (text: string) => {
  const effects = effectsIn(text)
  return effects.length > 0 && effects.every(({ effect }) => effect === 'read')
}
