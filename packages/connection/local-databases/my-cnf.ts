import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'
import ini from 'ini'

import type { Finder } from './local-database'

const clientSchema = type({
  'database?': 'string',
  'host?': 'string',
  'password?': 'string',
  'port?': 'string',
  'user?': 'string',
})

export const myCnf: Finder = {
  read: async (file) => {
    const { client, mysql } = ini.parse(await readFile(file, 'utf-8'))
    if (!client && !mysql) {
      return []
    }
    // The mysql client reads [client] first and lets [mysql] override it.
    const { host = 'localhost', ...rest } = clientSchema.assert({
      ...client,
      ...mysql,
    })
    return [{ name: '', parts: { ...rest, host, type: ConnectionType.MySQL } }]
  },
  source: '.my.cnf',
  targets: () => [path.join(homedir(), '.my.cnf')],
}
