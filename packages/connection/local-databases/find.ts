import { omit } from '@tamery/shared/utils'

import { connectionParts } from '../connection-parts'
import { mergeParts } from '../guess/parts'
import { connectionSecrets } from '../secrets'
import { dataGrip } from './datagrip'
import { dbeaver } from './dbeaver'
import { docker } from './docker'
import { pgpass, pgService } from './libpq'
import type {
  Finder,
  FoundEntry,
  LocalDatabase,
  Unlocked,
} from './local-database'
import { findEach, NOTHING_UNLOCKED } from './local-database'
import { myCnf } from './my-cnf'
import { pgAdmin } from './pgadmin'
import { tablePlus } from './tableplus'

const FINDERS: Finder[] = [
  docker,
  dbeaver,
  tablePlus,
  dataGrip,
  pgAdmin,
  pgService,
  pgpass,
  myCnf,
]

const NO_PARTS = {
  database: '',
  host: '',
  https: null,
  options: '',
  password: '',
  port: '',
  provider: null,
  ssh: null,
  user: '',
}

/** The connection string never carries a secret: only `unlock` hands out the password, and other secrets the user types. */
const localDatabase = (
  source: string,
  { name, parts, unlock = () => Promise.resolve(NOTHING_UNLOCKED) }: FoundEntry
): LocalDatabase[] => {
  const { password, type, ...server } = { ...NO_PARTS, ...mergeParts(parts) }
  return type && server.host
    ? [
        {
          connectionString: connectionSecrets.strip(
            connectionParts.format({ ...server, password: '', type })
          ),
          name: name || server.database || server.host,
          source,
          type,
          unlock: password
            ? () => Promise.resolve({ password, withheld: false })
            : unlock,
        },
      ]
    : []
}

const getDatabases = async ({ read, source, targets }: Finder) =>
  findEach(await targets(), async (target) => {
    const entries = await read(target)
    return entries.flatMap((entry) => localDatabase(source, entry))
  })

// Keyed by what `find` returned, so the renderer can only unlock a password a found database points at, never name an arbitrary Keychain item.
let found = new Map<string, LocalDatabase>()

export const localDatabases = {
  find: async () => {
    const unique = new Map<string, LocalDatabase>()
    for (const database of await findEach(FINDERS, getDatabases)) {
      const first = unique.get(database.connectionString)
      unique.set(
        database.connectionString,
        first
          ? {
              ...first,
              unlock: async () => {
                const unlocked = await first.unlock()
                if (unlocked.password) {
                  return unlocked
                }
                const next = await database.unlock()
                return next.password ? next : unlocked
              },
            }
          : database
      )
    }
    found = unique
    return [...unique.values()].map((database) => omit(database, ['unlock']))
  },
  unlock: async (connectionString: string): Promise<Unlocked> =>
    (await found.get(connectionString)?.unlock()) ?? NOTHING_UNLOCKED,
}
