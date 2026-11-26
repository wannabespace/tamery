import { describe, expect, it } from 'bun:test'

import {
  additiveOnly,
  destructiveMethods,
  invalidatesCatalog,
  readsOnly,
} from './effects'

describe('readsOnly', () => {
  it.each([
    ['db.users.find({ age: { $gt: 1 } }).sort({ age: 1 })', true],
    ['db.runCommand({ listCollections: 1 })', true],
    ['db.users.aggregate([{ $match: {} }, { $out: "copy" }])', false],
    ['db.users.aggregate([{ $merge: { into: "copy" } }])', false],
    ['db.runCommand({ drop: "users" })', false],
    ['db.users.find(); db.users.deleteOne({})', false],
    ['select 1', false],
    ['', false],
  ])('%j → %p', (text, expected) => {
    expect(readsOnly(text)).toBe(expected)
  })
})

describe('destructiveMethods', () => {
  it('names the calls that change or remove, never the additive ones', () => {
    expect(
      destructiveMethods(
        'db.a.insertOne({}); db.a.createIndex({ x: 1 }); db.a.updateMany({}, { $set: { x: 1 } }); db.b.drop(); db.b.drop()'
      )
    ).toStrictEqual(['updateMany', 'drop'])
  })
})

describe('invalidatesCatalog', () => {
  it.each([
    ['db.createCollection("logs")', true],
    ['db.logs.renameCollection("old")', true],
    ['db.logs.insertOne({})', false],
  ])('%j → %p', (text, expected) => {
    expect(invalidatesCatalog(text)).toBe(expected)
  })
})

describe('additiveOnly', () => {
  it('admits inserts and new collections', () => {
    expect(additiveOnly('db.orders.insertOne({ a: 1 })')).toBe(true)
    expect(additiveOnly('db.createCollection("logs")')).toBe(true)
  })

  it('refuses changes to existing documents', () => {
    expect(
      additiveOnly('db.orders.updateOne({ _id: 1 }, { $set: { a: 2 } })')
    ).toBe(false)
    expect(additiveOnly('db.orders.deleteMany({})')).toBe(false)
    expect(additiveOnly('db.orders.find({})')).toBe(false)
    expect(additiveOnly('not mongosh')).toBe(false)
  })
})
