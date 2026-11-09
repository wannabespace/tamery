import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'
import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { query } from '.'
import { databaseFile } from '../../../database-file'

const directory = mkdtempSync(path.join(tmpdir(), 'tamery-duckdb-'))
afterAll(() => rmSync(directory, { force: true, recursive: true }))

const connectionTo = (name: string) => ({
  connectionString: databaseFile.connectionString(
    ConnectionType.DuckDB,
    path.join(directory, name)
  ),
})

const file = connectionTo('app data.duckdb')
const created = await DuckDBInstance.create(
  path.join(directory, 'app data.duckdb')
)
created.closeSync()
await Bun.write(path.join(directory, 'notes.csv'), 'note\nsecret\n')

describe('duckdb executor', () => {
  test('answers each statement of a text with its own set', async () => {
    const { result } = await query.execute({
      ...file,
      query: `CREATE TABLE t (id INTEGER PRIMARY KEY, big BIGINT, tag VARCHAR, tags VARCHAR[], span INTERVAL, doc JSON, counts MAP(VARCHAR, INTEGER)[]);
        INSERT INTO t VALUES (1, 9007199254740993, 'a;b', ['x', 'y'], INTERVAL 3 DAY, '{"k":[1]}', [MAP {'a': 1}]), (2, 1, NULL, NULL, NULL, NULL, NULL);
        SELECT id, big, tag, tag, tags, span, doc, counts FROM t ORDER BY id;`,
    })

    expect(result).toEqual([
      { affectedRows: null, columns: [], rows: [], truncated: false },
      { affectedRows: 2, columns: [], rows: [], truncated: false },
      {
        affectedRows: null,
        columns: ['id', 'big', 'tag', 'tag', 'tags', 'span', 'doc', 'counts'],
        rows: [
          [
            1,
            '9007199254740993',
            'a;b',
            'a;b',
            ['x', 'y'],
            '3 days',
            { k: [1] },
            [{ a: 1 }],
          ],
          [2, '1', null, null, null, null, null, null],
        ],
        truncated: false,
      },
    ])
  })

  test('binds values and stops reading past maxRows', async () => {
    const { result } = await query.execute({
      ...file,
      maxRows: 1,
      query: 'SELECT id FROM t WHERE id >= $1 AND $2',
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
    expect(result[0]?.rows).toEqual([['2']])
  })

  test('a read-only transaction neither writes nor reads another file', async () => {
    const { txId } = await query.beginTransaction({
      ...file,
      accessMode: 'read only',
    })
    const run = (sql: string) =>
      query.executeTransaction({ query: sql, txId, values: [] })

    const { result } = await run('SELECT count(*) FROM t')
    expect(result[0]?.rows).toEqual([['2']])
    await expect(run('DELETE FROM t')).rejects.toThrow('read-only')
    await query.rollbackTransaction({ txId })

    const { txId: next } = await query.beginTransaction({
      ...file,
      accessMode: 'read only',
    })
    await expect(
      query.executeTransaction({
        query: `SELECT * FROM '${path.join(directory, 'notes.csv')}'`,
        txId: next,
        values: [],
      })
    ).rejects.toThrow('disabled by configuration')
    await query.rollbackTransaction({ txId: next })
  })

  test('a session keeps a transaction its SQL opens until the SQL ends it', async () => {
    const { txId } = await query.openSession(file)
    const run = (sql: string) =>
      query.executeTransaction({ query: sql, txId, values: [] })

    await run("BEGIN; INSERT INTO t (id, tag) VALUES (3, 'draft');")
    expect(await query.transactionStatus({ txId })).toBe('open')
    const { result } = await query.execute({
      ...file,
      query: 'SELECT count(*) FROM t',
    })
    expect(result[0]?.rows).toEqual([['2']])

    await expect(run('INSERT INTO t (id) VALUES (3)')).rejects.toThrow()
    expect(await query.transactionStatus({ txId })).toBe('failed')

    await run('ROLLBACK')
    expect(await query.transactionStatus({ txId })).toBe('ended')
  })

  test('a symlink reaches the same instance as its target', async () => {
    const link = path.join(directory, 'link.duckdb')
    symlinkSync(path.join(directory, 'app data.duckdb'), link)
    const { txId } = await query.beginTransaction(file)
    await query.executeTransaction({
      query: 'INSERT INTO t (id) VALUES (10)',
      txId,
      values: [],
    })
    await expect(
      query.execute({ ...connectionTo('link.duckdb'), query: 'SELECT 1' })
    ).resolves.toBeDefined()
    await query.commitTransaction({ txId })

    const { result } = await query.execute({
      ...connectionTo('link.duckdb'),
      query: 'SELECT count(*) FROM t WHERE id = 10',
    })
    expect(result[0]?.rows).toEqual([['1']])
  })

  test('a read-only call that times out leaves the open transaction alone', async () => {
    const { txId } = await query.beginTransaction(file)
    await query.executeTransaction({
      query: 'INSERT INTO t (id) VALUES (11)',
      txId,
      values: [],
    })
    const read = query.beginTransaction({ ...file, accessMode: 'read only' })
    await expect(read).rejects.toThrow('another mode')
    await query.executeTransaction({
      query: 'INSERT INTO t (id) VALUES (12)',
      txId,
      values: [],
    })
    await query.commitTransaction({ txId })

    const { result } = await query.execute({
      ...file,
      query: 'SELECT count(*) FROM t WHERE id IN (11, 12)',
    })
    expect(result[0]?.rows).toEqual([['2']])
  }, 15_000)

  test('never creates a file at a missing path', async () => {
    await expect(
      query.execute({ ...connectionTo('missing.duckdb'), query: 'SELECT 1' })
    ).rejects.toThrow('There is no file at')
    expect(
      await Bun.file(path.join(directory, 'missing.duckdb')).exists()
    ).toBe(false)
  })
})
