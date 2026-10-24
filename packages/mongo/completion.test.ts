import { describe, expect, it } from 'bun:test'

import { mongoCompletionContext, mongoCompletionItems } from './completion'

const catalog = {
  collections: [
    { name: 'users', view: false },
    { name: 'my-orders', view: false },
  ],
  fields: (collection: string) =>
    collection === 'users' ? [{ name: 'age', type: 'int' }] : null,
}

const complete = (template: string) => {
  const offset = template.indexOf('|')
  const context = mongoCompletionContext(template.replace('|', ''), offset)
  return mongoCompletionItems(context, catalog).map((item) => item.label)
}

describe('mongo completion', () => {
  it.each([
    ['db.|', ['users', 'my-orders', 'getCollection']],
    ['db.users.|', ['find', 'aggregate', 'updateOne']],
    ['db.users.find({})\n  .|', ['sort', 'limit']],
    ['db.users.find({ |})', ['age', '$or']],
    ["db.getCollection('users').updateOne({}, { |})", ['$set', '$inc']],
    ['db.users.updateOne({}, { $set: { | } })', ['age']],
    ['db.users.aggregate([{ | }])', ['$match', '$group']],
    ['db.users.aggregate([{ $match: { | } }])', ['age', '$gt']],
    ['db.users.find({ _id: | })', ['ObjectId', 'ISODate']],
  ])('offers %j', (template, expected) => {
    expect(complete(template)).toEqual(expect.arrayContaining(expected))
  })

  it.each([
    ['db.users.updateOne({}, { |})', 'age'],
    ['db.users.aggregate([{ | }])', 'age'],
    ['db.users.find({ |})', '$set'],
  ])('keeps %j to what fits there, without %j', (template, absent) => {
    expect(complete(template)).not.toContain(absent)
  })

  it('writes a collection name that is no identifier through getCollection', () => {
    const context = mongoCompletionContext('db.', 3)
    const item = mongoCompletionItems(context, catalog).find(
      ({ label }) => label === 'my-orders'
    )
    expect(item?.insertText).toBe('getCollection("my-orders")')
  })

  it('offers nothing inside a string', () => {
    expect(complete("db.users.find({ name: '|' })")).toStrictEqual([])
  })
})
