import { homedir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import type { Finder } from './local-database'
import { validEntries } from './local-database'

const serverSchema = type({
  host: 'string | null',
  maintenance_db: 'string | null',
  name: 'string',
  port: 'number | null',
  username: 'string | null',
})

export const pgAdmin: Finder = {
  read: (file) => {
    // readOnly also stops SQLite creating the file when pgAdmin was never installed.
    using database = new DatabaseSync(file, { readOnly: true })
    return validEntries(
      serverSchema,
      database
        .prepare(
          'SELECT name, host, port, maintenance_db, username FROM server'
        )
        .all()
    ).map((server) => ({
      name: server.name,
      parts: {
        database: server.maintenance_db ?? undefined,
        host: server.host ?? undefined,
        port: server.port?.toString(),
        type: ConnectionType.Postgres,
        user: server.username ?? undefined,
      },
    }))
  },
  source: 'pgAdmin',
  targets: () => [path.join(homedir(), '.pgadmin/pgadmin4.db')],
}
