import { describe, expect, it } from 'bun:test'

import { parseInsertOne, parseScript } from './parse'

const shape = (text: string): Record<string, unknown>[] =>
  parseScript(text).map(({ collection, cursor, database, method }) => ({
    collection,
    cursor: cursor.map((call) => call.method),
    database,
    method,
  }))

describe('parseScript', () => {
  it.each([
    [
      'db.users.find({}).sort({ a: 1 }).limit(5)',
      {
        collection: 'users',
        cursor: ['sort', 'limit'],
        database: null,
        method: 'find',
      },
    ],
    [
      'await db.getSiblingDB("blog").getCollection("my-posts").findOne()',
      {
        collection: 'my-posts',
        cursor: [],
        database: 'blog',
        method: 'findOne',
      },
    ],
    [
      'db.system.views.find()',
      {
        collection: 'system.views',
        cursor: [],
        database: null,
        method: 'find',
      },
    ],
    [
      'db.runCommand({ ping: 1 })',
      { collection: null, cursor: [], database: null, method: 'runCommand' },
    ],
  ])('reads %j', (text, expected) => {
    expect(shape(text)).toStrictEqual([expected])
  })

  it.each([
    'process.exit()',
    'const x = 1',
    'db.users.find().forEach(print)',
    'db.users.insertOne({}).sort()',
    'db.users.eval("1")',
    'db[name].find()',
    'db.users.find(...args)',
  ])('refuses %j', (text) => {
    expect(() => parseScript(text)).toThrow()
  })
})

const insert = (document: string, collection = 'users') =>
  `db.getCollection(${JSON.stringify(collection)}).insertOne(${document})`

describe('parseInsertOne', () => {
  it('accepts one insertOne on the collection', () => {
    expect(() =>
      parseInsertOne(insert('{ _id: ObjectId("…") }'), 'users')
    ).not.toThrow()
  })

  it.each([
    // A document that closes insertOne and chains more statements.
    '{}); db.dropDatabase(); db.getCollection("users").insertOne({',
    '{}); db.getCollection("secret").deleteMany({',
    '{}); db.runCommand({ dropDatabase: 1 }); db.getCollection("users").insertOne({',
  ])('refuses a document that chains more calls (%j)', (document) => {
    expect(() => parseInsertOne(insert(document), 'users')).toThrow()
  })
})
