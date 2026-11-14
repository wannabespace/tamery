import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'
import ini from 'ini'

import { guessPgpass } from '../guess/host'
import type { Finder } from './local-database'
import { validEntries } from './local-database'

const serviceSchema = type([
  'string',
  {
    // A dotted section name nests as an object, which a service never is.
    '[string]': 'string',
    'dbname?': 'string',
    'host?': 'string',
    'password?': 'string',
    'port?': 'string',
    'user?': 'string',
  },
])

export const pgpass: Finder = {
  read: async (file) => {
    const pgpassFile = await readFile(file, 'utf-8')
    return pgpassFile
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .flatMap((line) => {
        const guess = guessPgpass(line)
        return guess ? [{ name: '', parts: guess.parts }] : []
      })
  },
  source: '.pgpass',
  targets: () => [process.env.PGPASSFILE ?? path.join(homedir(), '.pgpass')],
}

export const pgService: Finder = {
  read: async (file) =>
    validEntries(
      serviceSchema,
      Object.entries(ini.parse(await readFile(file, 'utf-8')))
    ).map(([name, { dbname, host = 'localhost', password, port, user }]) => ({
      name,
      parts: {
        database: dbname,
        host,
        password,
        port,
        type: ConnectionType.Postgres,
        user,
      },
    })),
  source: 'pg_service.conf',
  targets: () => [
    process.env.PGSERVICEFILE ?? path.join(homedir(), '.pg_service.conf'),
  ],
}
