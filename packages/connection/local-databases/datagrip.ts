import { glob, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { type } from 'arktype'
import { Result } from 'better-result'
import { XMLParser } from 'fast-xml-parser'

import { guessConnection } from '../guess'
import { appDataDir } from './app-data'
import { keychainPassword } from './keychain'
import type { Finder } from './local-database'
import { validEntries } from './local-database'

const DATA_SOURCE_FILES = [
  path.join(appDataDir(), 'JetBrains/*/options/dataSources.xml'),
  path.join(appDataDir(), 'JetBrains/*/projects/*/.idea/dataSources.xml'),
  path.join(homedir(), 'DataGripProjects/*/.idea/dataSources.xml'),
]

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  isArray: (tag) => tag === 'component' || tag === 'data-source',
  parseTagValue: false,
})

const fileSchema = type({
  project: { component: type({ 'data-source?': 'unknown[]' }).array() },
})

const dataSourceSchema = type({
  'jdbc-url?': 'string',
  name: 'string',
  'user-name?': 'string',
  'uuid?': 'string',
})

const dataSourcesIn = async (file: string) =>
  validEntries(
    dataSourceSchema,
    fileSchema
      .assert(parser.parse(await readFile(file, 'utf-8')))
      .project.component.flatMap((component) => component['data-source'] ?? [])
  )

export const dataGrip: Finder = {
  read: async (file) => {
    const [dataSources, local] = await Promise.all([
      dataSourcesIn(file),
      Result.tryPromise(() =>
        dataSourcesIn(file.replace(/\.xml$/u, '.local.xml'))
      ),
    ])
    const userOf = new Map(
      local
        .unwrapOr([])
        .map((dataSource) => [dataSource.uuid, dataSource['user-name']])
    )
    return dataSources.map(({ 'jdbc-url': url = '', name, uuid }) => {
      const parts = guessConnection(url)?.parts ?? {}
      return {
        name,
        parts: { ...parts, user: parts.user || (uuid && userOf.get(uuid)) },
        unlock: uuid
          ? () =>
              // JetBrains' own service name, em dash included: any other character finds nothing.
              keychainPassword({ service: `IntelliJ Platform DB — ${uuid}` })
          : undefined,
      }
    })
  },
  source: 'DataGrip',
  targets: () => Array.fromAsync(glob(DATA_SOURCE_FILES)),
}
