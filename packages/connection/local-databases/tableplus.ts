import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { type } from 'arktype'

import { getConnectionType } from '../connection-parts'
import { EMPTY_SSH_TUNNEL } from '../ssh/params'
import { keychainPassword } from './keychain'
import type { Finder } from './local-database'
import { validEntries } from './local-database'

const CONNECTION_FILES = [
  'com.tinyapp.TablePlus',
  'com.tinyapp.TablePlus-setapp',
].map((bundleId) =>
  path.join(
    homedir(),
    'Library/Application Support',
    bundleId,
    'Data/Connections.plist'
  )
)

const connectionSchema = type({
  ConnectionName: 'string',
  DatabaseHost: 'string',
  DatabaseName: 'string',
  DatabasePort: 'string',
  DatabaseUser: 'string',
  Driver: 'string',
  ID: 'string',
  'ServerAddress?': 'string',
  'ServerPort?': 'string',
  'ServerUser?': 'string',
  'isOverSSH?': 'boolean',
})

export const tablePlus: Finder = {
  read: async (file) => {
    const { stdout } = await promisify(execFile)('/usr/bin/plutil', [
      '-convert',
      'json',
      '-o',
      '-',
      file,
    ])
    return validEntries(
      connectionSchema,
      type('unknown[]').assert(JSON.parse(stdout))
    ).map((connection) => ({
      name: connection.ConnectionName,
      parts: {
        database: connection.DatabaseName,
        host: connection.DatabaseHost,
        port: connection.DatabasePort,
        ssh: connection.isOverSSH
          ? {
              ...EMPTY_SSH_TUNNEL,
              host: connection.ServerAddress ?? '',
              port: connection.ServerPort ?? '',
              user: connection.ServerUser ?? '',
            }
          : null,
        type: getConnectionType(connection.Driver),
        user: connection.DatabaseUser,
      },
      unlock: () =>
        keychainPassword({
          account: `${connection.ID}_database`,
          service: 'com.tableplus.TablePlus',
        }),
    }))
  },
  source: 'TablePlus',
  targets: () => (process.platform === 'darwin' ? CONNECTION_FILES : []),
}
