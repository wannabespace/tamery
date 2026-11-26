import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { mssqlAddress } from './ado'
import { partsOfVariables, variablesOfLines } from './env'
import { guessKeyValue } from './key-value'
import { mergeParts } from './parts'
import { shellCommands } from './tokens'
import type { DatabaseGuess, ServerField } from './types'
import { guessUrl } from './url'

type Field = ServerField | 'server'

const DROP_VALUE = null

interface Client {
  type: ConnectionType
  /** Flags that prompt when bare, so their value must be glued on: `-pSECRET`, `--password=SECRET`. */
  gluedOnly?: string[]
  /** Every flag that takes a value, so its value is never read as a positional. */
  options: Record<string, Field | typeof DROP_VALUE>
  positionals: ServerField[]
}

const PSQL: Client = {
  options: {
    '--command': DROP_VALUE,
    '--dbname': 'database',
    '--file': DROP_VALUE,
    '--host': 'host',
    '--port': 'port',
    '--username': 'user',
    '-U': 'user',
    '-c': DROP_VALUE,
    '-d': 'database',
    '-f': DROP_VALUE,
    '-h': 'host',
    '-p': 'port',
    '-v': DROP_VALUE,
  },
  positionals: ['database', 'user'],
  type: ConnectionType.Postgres,
}

const MYSQL: Client = {
  gluedOnly: ['-p', '--password'],
  options: {
    '--database': 'database',
    '--execute': DROP_VALUE,
    '--host': 'host',
    '--password': 'password',
    '--port': 'port',
    '--socket': DROP_VALUE,
    '--user': 'user',
    '-D': 'database',
    '-P': 'port',
    '-S': DROP_VALUE,
    '-e': DROP_VALUE,
    '-h': 'host',
    '-p': 'password',
    '-u': 'user',
  },
  positionals: ['database'],
  type: ConnectionType.MySQL,
}

const MARIADB: Client = { ...MYSQL, type: ConnectionType.MariaDB }

const SQLCMD: Client = {
  options: {
    '-P': 'password',
    '-Q': DROP_VALUE,
    '-S': 'server',
    '-U': 'user',
    '-d': 'database',
    '-i': DROP_VALUE,
    '-o': DROP_VALUE,
    '-q': DROP_VALUE,
  },
  positionals: [],
  type: ConnectionType.MSSQL,
}

const CLICKHOUSE: Client = {
  options: {
    '--database': 'database',
    '--host': 'host',
    '--password': 'password',
    '--port': 'port',
    '--query': DROP_VALUE,
    '--user': 'user',
    '-d': 'database',
    '-h': 'host',
    '-q': DROP_VALUE,
    '-u': 'user',
  },
  positionals: [],
  type: ConnectionType.ClickHouse,
}

const CLIENTS: Record<string, Client> = {
  clickhouse: CLICKHOUSE,
  'clickhouse-client': CLICKHOUSE,
  mariadb: MARIADB,
  'mariadb-dump': MARIADB,
  mycli: MYSQL,
  mysql: MYSQL,
  mysqldump: MYSQL,
  pg_dump: PSQL,
  pgcli: PSQL,
  psql: PSQL,
  sqlcmd: SQLCMD,
}

const FLAG = /^(?<flag>--[^=]+|-[^-])=?(?<glued>.*)$/su
const CONNINFO = /:\/\/|=/u

const basename = (token = '') => token.split('/').at(-1) ?? ''

const readArgs = (client: Client, args: string[]) => {
  const found: Partial<Record<Field, string>> = {}
  const positionals: string[] = []
  while (args.length > 0) {
    const arg = args.shift() ?? ''
    const { flag = '', glued = '' } = FLAG.exec(arg)?.groups ?? {}
    if (!flag) {
      positionals.push(arg)
    } else if (Object.hasOwn(client.options, flag)) {
      const value =
        glued || (client.gluedOnly?.includes(flag) ? '' : args.shift())
      const field = client.options[flag]
      if (field && value) {
        found[field] ??= value
      }
    }
  }
  return { found, positionals }
}

const guessCommand = (tokens: string[]): DatabaseGuess | null => {
  const start = tokens.findIndex(
    (token, index) =>
      Object.hasOwn(CLIENTS, basename(token)) &&
      (basename(token) !== 'clickhouse' || tokens[index + 1] === 'client')
  )
  const client = CLIENTS[basename(tokens[start])]
  if (!client) {
    return null
  }

  const {
    found: { server = '', ...found },
    positionals,
  } = readArgs(client, tokens.slice(start + 1))
  const conninfo = positionals.find((positional) => CONNINFO.test(positional))
  const conninfoGuess = conninfo
    ? (guessUrl(conninfo) ?? guessKeyValue(conninfo))
    : null
  const plain = positionals.filter((positional) => positional !== conninfo)
  for (const [index, field] of client.positionals.entries()) {
    found[field] ??= plain[index]
  }

  return {
    format: 'cli',
    parts: mergeParts(
      found,
      mssqlAddress(server),
      conninfoGuess?.parts ?? {},
      partsOfVariables(variablesOfLines(tokens.slice(0, start))) ?? {},
      { type: client.type }
    ),
  }
}

export const guessCli = (text: string): DatabaseGuess | null =>
  text
    .split('\n')
    .values()
    .map((line) => guessCommand(shellCommands(line)[0] ?? []))
    .find(Boolean) ?? null
