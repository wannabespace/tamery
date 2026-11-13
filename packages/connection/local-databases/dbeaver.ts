import { createDecipheriv } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { type } from 'arktype'
import { Result } from 'better-result'

import { getConnectionType } from '../connection-parts'
import { appDataDir } from './app-data'
import type { Finder } from './local-database'
import { validEntries } from './local-database'

const DATA_SOURCES = 'workspace6/General/.dbeaver/data-sources.json'
const CREDENTIALS = 'workspace6/General/.dbeaver/credentials-config.json'

// Not a secret: DBeaver obfuscates its credentials file with this fixed key from its own source.
const CREDENTIALS_KEY = Buffer.from('babb4a9f774ab853c96c2d653dfe544a', 'hex')
const IV_BYTES = 16

const DATA_DIRS = [
  path.join(homedir(), 'Library/DBeaverData'),
  path.join(homedir(), '.local/share/DBeaverData'),
  path.join(appDataDir(), 'DBeaverData'),
]

const dataSourcesSchema = type({ connections: 'Record<string, unknown>' })

const connectionSchema = type([
  'string',
  {
    configuration: {
      'database?': 'string',
      'host?': 'string',
      'port?': 'string | number',
      'user?': 'string',
    },
    'driver?': 'string',
    name: 'string',
    provider: 'string',
  },
])

const credentialsSchema = type({
  '[string]': { '#connection?': { 'password?': 'string', 'user?': 'string' } },
})

export const dbeaver: Finder = {
  read: async (dataDir) => {
    const { connections } = dataSourcesSchema.assert(
      JSON.parse(await readFile(path.join(dataDir, DATA_SOURCES), 'utf-8'))
    )
    const credentials = await Result.tryPromise(async () => {
      const file = await readFile(path.join(dataDir, CREDENTIALS))
      const decipher = createDecipheriv(
        'aes-128-cbc',
        CREDENTIALS_KEY,
        file.subarray(0, IV_BYTES)
      )
      return credentialsSchema.assert(
        JSON.parse(
          Buffer.concat([
            decipher.update(file.subarray(IV_BYTES)),
            decipher.final(),
          ]).toString('utf-8')
        )
      )
    })
    return validEntries(connectionSchema, Object.entries(connections)).map(
      ([id, { configuration, driver, name, provider }]) => {
        const saved = credentials.unwrapOr(null)?.[id]?.['#connection']
        return {
          name,
          parts: {
            database: configuration.database,
            host: configuration.host,
            password: saved?.password,
            port: String(configuration.port ?? ''),
            type:
              (driver === undefined ? null : getConnectionType(driver)) ??
              getConnectionType(provider),
            user: saved?.user ?? configuration.user,
          },
        }
      }
    )
  },
  source: 'DBeaver',
  targets: () => DATA_DIRS,
}
