import { D1_HOST } from '@tamery/connection/connection-parts'
import type { ServerField } from '@tamery/connection/guess/types'
import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

export interface Engine {
  provider: Provider | null
  type: ConnectionType
}

export const isSqliteFile = ({ provider, type }: Engine) =>
  type === ConnectionType.SQLite && !provider

interface FieldRow {
  label: string
  name: Exclude<ServerField, 'port'> | 'options'
  /** Left out of what a paste says is still missing. */
  optional?: true
  placeholder?: string
  /** Shows the port beside it, which saves the port too. */
  port?: true
  /** Blocks saving while empty, with this message; the engine's `field` is always required. */
  required?: string
  secret?: true
}

export interface EngineFields {
  /** Names where the database is: required, read whole on blur like a paste, focused when an edit opens. */
  field: 'database' | 'host'
  fixedHost?: string
  message: string
  rows: FieldRow[]
  sshTunnel?: boolean
}

const serverFields = ({
  database,
  options,
  sshTunnel = true,
  user,
}: {
  database: string | Omit<FieldRow, 'name'>
  options?: string
  sshTunnel?: boolean
  user: string
}): EngineFields => ({
  field: 'host',
  message: 'Enter the host',
  rows: [
    {
      label: 'Host',
      name: 'host',
      placeholder: 'db.example.com or any connection string',
      port: true,
    },
    { label: 'User', name: 'user', placeholder: user },
    { label: 'Password', name: 'password', placeholder: 'None', secret: true },
    typeof database === 'string'
      ? {
          label: 'Database',
          name: 'database',
          optional: true,
          placeholder: database,
        }
      : { ...database, name: 'database' },
    { label: 'Options', name: 'options', optional: true, placeholder: options },
  ],
  sshTunnel,
})

const MYSQL_FIELDS = serverFields({
  database: 'Optional',
  options: 'e.g. ssl=true',
  user: 'e.g. root',
})

/** Only the fields an engine's rows show are saved, so nothing the form hides reaches the string. */
const ENGINE_FIELDS: Record<ConnectionType | Provider, EngineFields> = {
  [ConnectionType.ClickHouse]: serverFields({
    database: 'default',
    user: 'default',
  }),
  [ConnectionType.MariaDB]: MYSQL_FIELDS,
  [ConnectionType.MongoDB]: serverFields({
    database: 'test',
    options: 'e.g. authSource=admin&tls=true',
    user: 'e.g. admin',
  }),
  [ConnectionType.MSSQL]: serverFields({
    database: 'master',
    options: 'e.g. encrypt=true',
    user: 'e.g. sa',
  }),
  [ConnectionType.MySQL]: MYSQL_FIELDS,
  [ConnectionType.Oracle]: serverFields({
    database: {
      label: 'Service name',
      placeholder: 'e.g. FREEPDB1',
      required: 'Enter the service name',
    },
    options: 'e.g. ssl=true',
    // node-oracledb opens its own socket, so the executor refuses a tunnel.
    sshTunnel: false,
    user: 'e.g. system',
  }),
  [ConnectionType.Postgres]: serverFields({
    database: 'postgres',
    options: 'e.g. sslmode=require',
    user: 'e.g. postgres',
  }),
  [ConnectionType.SQLite]: {
    field: 'database',
    message: 'Choose the database file',
    rows: [{ label: 'File', name: 'database', placeholder: '/path/to/app.db' }],
  },
  [Provider.CloudflareD1]: {
    field: 'database',
    fixedHost: D1_HOST,
    message: 'Enter the database ID',
    rows: [
      {
        label: 'Account ID',
        name: 'user',
        placeholder: 'In the dashboard URL, after dash.cloudflare.com/',
        required: 'Enter the account ID',
      },
      {
        label: 'Database ID',
        name: 'database',
        placeholder: "Or paste the database's dashboard link",
      },
      {
        label: 'API token',
        name: 'password',
        placeholder: 'With D1 Edit permission',
        required: 'Enter the API token',
        secret: true,
      },
    ],
  },
  [Provider.MongoDBAtlas]: {
    field: 'host',
    message: 'Enter the cluster address',
    rows: [
      {
        label: 'Host',
        name: 'host',
        placeholder: 'cluster0.abcde.mongodb.net or its mongodb+srv:// string',
      },
      { label: 'User', name: 'user', placeholder: 'Database user' },
      {
        label: 'Password',
        name: 'password',
        placeholder: 'None',
        secret: true,
      },
      {
        label: 'Database',
        name: 'database',
        optional: true,
        placeholder: 'test',
      },
      {
        label: 'Options',
        name: 'options',
        optional: true,
        placeholder: 'e.g. appName=Cluster0',
      },
    ],
    sshTunnel: true,
  },
  [Provider.Turso]: {
    field: 'host',
    message: 'Enter the host',
    rows: [
      {
        label: 'Host',
        name: 'host',
        placeholder: 'my-db-org.turso.io or its libsql:// URL',
        port: true,
      },
      {
        label: 'Auth token',
        name: 'password',
        placeholder: 'None',
        secret: true,
      },
      {
        label: 'Options',
        name: 'options',
        optional: true,
        placeholder: 'e.g. tls=0',
      },
    ],
  },
}

export const getEngineFields = ({ provider, type }: Engine) =>
  ENGINE_FIELDS[provider ?? type]

const startsWithAcronym = (label: string) => /^[A-Z]{2}/u.test(label)

export const getFieldNoun = ({ rows }: EngineFields, field: string) => {
  const label = rows.find((row) => row.name === field)?.label ?? field
  return startsWithAcronym(label)
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1)
}
