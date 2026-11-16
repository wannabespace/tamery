import { expect, test } from 'bun:test'

import { guessConnection } from '@tamery/connection/guess'
import { EMPTY_SSH_TUNNEL } from '@tamery/connection/ssh/params'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'

import type { ConnectionFormValues } from './connection-form'
import { getFoundDatabase } from './connection-form'

const pickFound = (connectionString: string): ConnectionFormValues => {
  const parts = guessConnection(connectionString, true)?.parts
  if (!parts?.type) {
    throw new Error(`Can't read ${connectionString}`)
  }
  return {
    color: null,
    database: parts.database ?? '',
    foundDatabase: { connectionString, source: 'DBeaver' },
    host: parts.host ?? '',
    https: parts.https ?? null,
    label: '',
    name: 'found',
    options: parts.options ?? '',
    password: '',
    port: parts.port ?? '',
    provider: parts.provider ?? null,
    ssh: EMPTY_SSH_TUNNEL,
    sshEnabled: false,
    syncType: SyncType.Cloud,
    type: parts.type,
    user: parts.user ?? '',
  }
}

test.each([
  'postgres://me@localhost:5433/app',
  'mysql://root@127.0.0.1:3306/shop',
  'postgres://me@db.local:5432/app?sslmode=require',
])(
  'a picked %s keeps its found password until the form names another server',
  (found) => {
    const picked = pickFound(found)
    expect(getFoundDatabase(picked)).toBe(picked.foundDatabase)
    expect(getFoundDatabase({ ...picked, database: 'other' })).toBe(
      picked.foundDatabase
    )
    for (const edit of [
      { host: 'evil.example' },
      { port: '6543' },
      { user: 'admin' },
      { password: 'typed' },
      { type: ConnectionType.MSSQL },
    ]) {
      expect(getFoundDatabase({ ...picked, ...edit })).toBeNull()
    }
  }
)
