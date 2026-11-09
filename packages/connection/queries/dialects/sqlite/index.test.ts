import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { query } from '.'
import { databaseFile } from '../../../database-file'

const directory = mkdtempSync(path.join(tmpdir(), 'tamery-sqlite-'))
afterAll(() => rmSync(directory, { force: true, recursive: true }))

const connectionTo = (name: string) => ({
  connectionString: databaseFile.connectionString(
    ConnectionType.SQLite,
    path.join(directory, name)
  ),
})

const file = connectionTo('app data.db')
await Bun.write(path.join(directory, 'app data.db'), '')

describe('sqlite executor', () => {
  test('answers each statement of a text with its own set', async () => {
    const { result } = await query.execute({
      ...file,
      query: `CREATE TABLE t (id INTEGER PRIMARY KEY, big INTEGER, tag TEXT);
        INSERT INTO t (big, tag) VALUES (9007199254740993, 'a;b'), (1, NULL);
        SELECT id, big, tag, tag FROM t ORDER BY id;`,
    })

    expect(result).toEqual([
      { affectedRows: 0, columns: [], rows: [], truncated: false },
      { affectedRows: 2, columns: [], rows: [], truncated: false },
      {
        affectedRows: null,
        columns: ['id', 'big', 'tag', 'tag'],
        rows: [
          [1, '9007199254740993', 'a;b', 'a;b'],
          [2, 1, null, null],
        ],
        truncated: false,
      },
    ])
  })

  test('binds values and stops reading past maxRows', async () => {
    const { result } = await query.execute({
      ...file,
      maxRows: 1,
      query: 'SELECT id FROM t WHERE id >= ? AND ?',
      values: [1, true],
    })

    expect(result).toEqual([
      { affectedRows: null, columns: ['id'], rows: [[1]], truncated: true },
    ])
  })

  test('a rolled back transaction leaves the file as it was', async () => {
    const { txId } = await query.beginTransaction(file)
    await query.executeTransaction({ query: 'DELETE FROM t', txId, values: [] })
    await query.rollbackTransaction({ txId })

    const { result } = await query.execute({
      ...file,
      query: 'SELECT count(*) AS total FROM t',
    })
    expect(result[0]?.rows).toEqual([[2]])
  })

  test('a session keeps a transaction its SQL opens until the SQL ends it', async () => {
    const { txId } = await query.openSession(file)
    const run = (sql: string) =>
      query.executeTransaction({ query: sql, txId, values: [] })

    await run("BEGIN; INSERT INTO t (tag) VALUES ('draft');")
    expect(await query.transactionStatus({ txId })).toBe('open')
    const { result } = await query.execute({
      ...file,
      query: 'SELECT count(*) FROM t',
    })
    expect(result[0]?.rows).toEqual([[2]])

    await run('ROLLBACK')
    expect(await query.transactionStatus({ txId })).toBe('ended')
  })

  test('never creates a file at a missing path', async () => {
    await expect(
      query.execute({ ...connectionTo('missing.db'), query: 'SELECT 1' })
    ).rejects.toThrow('Unable to open database file')
    expect(await Bun.file(path.join(directory, 'missing.db')).exists()).toBe(
      false
    )
  })
})
