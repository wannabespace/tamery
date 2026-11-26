import { expect, mock, spyOn, test } from 'bun:test'
import process from 'node:process'

import { logDriverError } from '@tamery/shared/sanitize-log'
import { Pool } from 'pg'

import { SSH_ELSEWHERE } from '../../../ssh/params'
import { getPool } from './client'
import { query } from './index'

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/postgres'

test('both the TLS pool and its plaintext fallback handle idle-client errors', async () => {
  const logging = spyOn(console, 'error').mockImplementation(mock())
  const poolQuery = spyOn(Pool.prototype, 'query')
    .mockImplementationOnce(() => {
      throw new Error('The server does not support SSL connections')
    })
    .mockImplementation(() =>
      Promise.resolve({
        command: 'SELECT',
        fields: [],
        oid: 0,
        rowCount: 0,
        rows: [],
      })
    )
  const listeners = spyOn(Pool.prototype, 'on')
  try {
    await getPool('postgres://user:password@host/db')
    expect(listeners.mock.calls).toHaveLength(2)
    for (const [event, listener] of listeners.mock.calls) {
      expect(event).toBe('error')
      expect(listener).toBe(logDriverError)
    }
    for (const pool of poolQuery.mock.contexts.slice(0, 2)) {
      expect(
        pool instanceof Pool &&
          pool.emit('error', new Error('idle connection dropped'))
      ).toBe(true)
    }
    expect(logging).toHaveBeenCalledTimes(2)
  } finally {
    logging.mockRestore()
    poolQuery.mockRestore()
    listeners.mockRestore()
  }
})

test('falls back to plaintext only when the server has no TLS', async () => {
  const poolQuery = spyOn(Pool.prototype, 'query').mockImplementation(() => {
    throw new Error('password authentication failed')
  })
  try {
    await expect(
      getPool('postgres://user:password@tls-host/db')
    ).rejects.toThrow('password authentication failed')
    expect(poolQuery).toHaveBeenCalledTimes(1)
  } finally {
    poolQuery.mockRestore()
  }
})

test('an SSH string reaches no driver unless the desktop app opens its tunnel', async () => {
  const connect = spyOn(Pool.prototype, 'query')
  try {
    await expect(
      getPool('postgres://user@db.internal/db?ssh_host=bastion')
    ).rejects.toThrow(SSH_ELSEWHERE)
    expect(connect).not.toHaveBeenCalled()
  } finally {
    connect.mockRestore()
  }
})

test('a query queued behind one running past the connect timeout still runs', async () => {
  const long = query.execute({
    connectionString: DATABASE_URL,
    query: 'select pg_sleep(35)',
  })
  await Bun.sleep(500)
  const queued = await query.execute({
    connectionString: DATABASE_URL,
    query: 'select 1 as one',
  })
  expect(queued.result[0]?.rows).toStrictEqual([[1]])
  await long
}, 45_000)
