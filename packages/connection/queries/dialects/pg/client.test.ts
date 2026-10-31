import { expect, mock, spyOn, test } from 'bun:test'

import { logDriverError } from '@tamery/shared/sanitize-log'
import { Pool } from 'pg'

import { SSH_DESKTOP_ONLY } from '../../../ssh/params'
import { getPool } from './client'

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
    ).rejects.toThrow(SSH_DESKTOP_ONLY)
    expect(connect).not.toHaveBeenCalled()
  } finally {
    connect.mockRestore()
  }
})
