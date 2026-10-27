import { describe, expect, it } from 'bun:test'

import { splitStatements } from './statements'

const texts = (text: string) =>
  splitStatements(text).map((statement) => statement.text)

describe('splitStatements', () => {
  it.each([
    ['db.a.find()\ndb.b.find()', ['db.a.find()', 'db.b.find()']],
    ['db.a.find(); db.b.drop()', ['db.a.find()', 'db.b.drop()']],
    [
      'db.a.find({\n  x: 1\n})\n  .sort({ x: 1 })',
      ['db.a.find({\n  x: 1\n})\n  .sort({ x: 1 })'],
    ],
    ['db.a.insertOne({ s: "a;b\\n" })', ['db.a.insertOne({ s: "a;b\\n" })']],
    ['// note\n\ndb.a.find({ r: /;/ })', ['db.a.find({ r: /;/ })']],
    ['db.a.find({ a: 1,\n b: 2 })', ['db.a.find({ a: 1,\n b: 2 })']],
  ])('splits %j', (text, expected) => {
    expect(texts(text)).toStrictEqual(expected)
  })
})
