import { once } from 'node:events'
import { get } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { text } from 'node:stream/consumers'

import {
  ConnectionType,
  getDialect,
  Dialect,
} from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { getConnectionType, TYPE_OF_DEFAULT_PORT } from '../connection-parts'
import { partsOfVariables } from '../guess/env'
import { mergeParts } from '../guess/parts'
import type { Finder } from './local-database'
import { findEach } from './local-database'

const { DOCKER_HOST } = process.env

const SOCKETS = (
  DOCKER_HOST
    ? [/^unix:\/\/(?<path>.+)$/u.exec(DOCKER_HOST)?.groups?.path]
    : [
        '/var/run/docker.sock',
        path.join(homedir(), '.docker/run/docker.sock'),
        path.join(homedir(), '.orbstack/run/docker.sock'),
        path.join(homedir(), '.colima/default/docker.sock'),
        path.join(homedir(), '.rd/docker.sock'),
        String.raw`\\.\pipe\docker_engine`,
      ]
).filter((socket) => socket !== undefined)

const ANSWER_TIMEOUT_MS = 2000
const ANY_ADDRESS = new Set(['', '0.0.0.0', '::'])

const IMAGE_USERS: Partial<Record<Dialect, string>> = {
  [Dialect.ClickHouse]: 'default',
  [Dialect.MSSQL]: 'sa',
  [Dialect.MySQL]: 'root',
  [Dialect.Oracle]: 'system',
  [Dialect.Postgres]: 'postgres',
}

/** The pluggable database each Oracle image creates; the root container holds no app schemas. */
const ORACLE_IMAGE_SERVICES: Record<string, string> = {
  'container-registry.oracle.com/database/express': 'XEPDB1',
  'container-registry.oracle.com/database/free': 'FREEPDB1',
  'gvenzl/oracle-free': 'FREEPDB1',
  'gvenzl/oracle-xe': 'XEPDB1',
}

const containersSchema = type({
  Id: 'string',
  Image: 'string',
  Names: 'string[]',
  Ports: type({
    'IP?': 'string',
    PrivatePort: 'number',
    'PublicPort?': 'number',
  }).array(),
}).array()

const inspectSchema = type({ Config: { Env: 'string[]' } })

const dockerGet = async (socketPath: string, urlPath: string) => {
  const request = get({ path: urlPath, socketPath, timeout: ANSWER_TIMEOUT_MS })
  request.on('timeout', () =>
    request.destroy(new Error('Docker did not answer'))
  )
  const [response] = await once(request, 'response')
  return JSON.parse(await text(response))
}

export const docker: Finder = {
  read: async (socketPath) => {
    const containers = containersSchema.assert(
      await dockerGet(socketPath, '/containers/json')
    )
    return findEach(containers, async ({ Id, Image, Names, Ports }) => {
      const published = Ports.flatMap(
        ({ IP = '', PrivatePort, PublicPort }) => {
          const connectionType = TYPE_OF_DEFAULT_PORT[PrivatePort]
          return connectionType && PublicPort
            ? [
                {
                  connectionType,
                  host: ANY_ADDRESS.has(IP) ? 'localhost' : IP,
                  port: String(PublicPort),
                },
              ]
            : []
        }
      )
      if (published.length === 0) {
        return []
      }
      const { Config } = inspectSchema.assert(
        await dockerGet(socketPath, `/containers/${Id}/json`)
      )
      // Split by hand, not `variablesOfLines`: a container's value is exact, so quotes and ` #` belong to the password.
      const variables: Record<string, string> = Object.fromEntries(
        Config.Env.map((variable) => {
          const equals = variable.indexOf('=')
          return [variable.slice(0, equals), variable.slice(equals + 1)]
        })
      )
      const env = partsOfVariables(variables) ?? {}
      const name = Names[0]?.replace(/^\//u, '') ?? ''
      const repository = Image.replace(/[:@][^/]*$/u, '')
      const named = [
        getConnectionType(repository.split('/').at(-1) ?? ''),
        env.type,
      ]
      return published.map(({ connectionType, ...server }) => {
        const dialect = getDialect(connectionType)
        const parts = mergeParts(
          {
            ...server,
            // The image's HTTP port is plain text whatever port it is published on, which would read as HTTPS.
            https: dialect === Dialect.ClickHouse ? false : null,
            type:
              named.find(
                (candidate) => candidate && getDialect(candidate) === dialect
              ) ?? connectionType,
          },
          // Ahead of `env`: the gvenzl Oracle images' ORACLE_PASSWORD is SYSTEM's, and the app account they create beside it must win.
          dialect === Dialect.Oracle
            ? {
                password: variables.APP_USER_PASSWORD,
                user: variables.APP_USER,
              }
            : {},
          env,
          {
            database: ORACLE_IMAGE_SERVICES[repository],
            user: IMAGE_USERS[dialect],
          }
        )
        return {
          name,
          parts:
            connectionType === ConnectionType.Postgres
              ? { database: parts.user, ...parts }
              : parts,
        }
      })
    })
  },
  source: 'Docker',
  targets: () => SOCKETS,
}
