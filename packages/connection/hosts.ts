import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import {
  CLICKHOUSE_HTTP_PORT_OF_NATIVE,
  CLICKHOUSE_HTTPS_PORT,
  TYPE_OF_DEFAULT_PORT,
} from './connection-parts'

interface HostHint {
  getDirectHost?: (host: string) => string
  ipv6Only?: RegExp
  label: string
  port?: string
  projectInUser?: RegExp
  provider?: Provider
  suffixes: string[]
  /** The engine's default port skips this provider's transaction pooler. */
  transactionPoolerPort?: string
  type?: ConnectionType
}

const SUPABASE_TRANSACTION_POOLER_PORT = '6543'
const PGBOUNCER_PORT = '6432'

const HOST_HINTS: HostHint[] = [
  {
    ipv6Only: /^db\.[^.]+\.supabase\.co$/iu,
    label: 'Supabase',
    projectInUser: /\.pooler\.supabase\.com$/iu,
    suffixes: ['.supabase.co', '.supabase.com'],
    transactionPoolerPort: SUPABASE_TRANSACTION_POOLER_PORT,
    type: ConnectionType.Postgres,
  },
  {
    getDirectHost: (host) => host.replace(/-pooler(?=\.)/iu, ''),
    label: 'Neon',
    suffixes: ['.neon.tech'],
    type: ConnectionType.Postgres,
  },
  { label: 'Render', suffixes: ['.render.com'], type: ConnectionType.Postgres },
  {
    label: 'Azure Database for PostgreSQL',
    suffixes: ['.postgres.database.azure.com'],
    transactionPoolerPort: PGBOUNCER_PORT,
    type: ConnectionType.Postgres,
  },
  {
    label: 'CockroachDB Cloud',
    port: '26257',
    suffixes: ['.cockroachlabs.cloud'],
    type: ConnectionType.Postgres,
  },
  {
    label: 'Crunchy Bridge',
    suffixes: ['.db.postgresbridge.com'],
    type: ConnectionType.Postgres,
  },
  {
    label: 'Timescale',
    suffixes: ['.tsdb.cloud.timescale.com'],
    type: ConnectionType.Postgres,
  },
  {
    label: 'Prisma Postgres',
    suffixes: ['db.prisma.io'],
    type: ConnectionType.Postgres,
  },
  { label: 'Xata', suffixes: ['.sql.xata.sh'], type: ConnectionType.Postgres },
  {
    label: 'Nile',
    suffixes: ['db.thenile.dev'],
    type: ConnectionType.Postgres,
  },
  { label: 'Fly.io', suffixes: ['.flympg.net'], type: ConnectionType.Postgres },
  { label: 'Railway', suffixes: ['.railway.app', '.rlwy.net'] },
  { label: 'AWS RDS', suffixes: ['.rds.amazonaws.com'] },
  {
    label: 'Azure SQL',
    suffixes: ['.database.windows.net'],
    type: ConnectionType.MSSQL,
  },
  {
    label: 'PlanetScale',
    suffixes: ['.psdb.cloud', '.planetscale.com'],
    type: ConnectionType.MySQL,
  },
  {
    label: 'Azure Database for MySQL',
    suffixes: ['.mysql.database.azure.com'],
    type: ConnectionType.MySQL,
  },
  {
    label: 'SingleStore',
    suffixes: ['.svc.singlestore.com'],
    type: ConnectionType.MySQL,
  },
  {
    label: 'MariaDB SkySQL',
    suffixes: ['.skysql.com'],
    type: ConnectionType.MariaDB,
  },
  {
    label: 'TiDB Cloud',
    suffixes: ['.tidbcloud.com'],
    type: ConnectionType.MySQL,
  },
  {
    label: 'ClickHouse Cloud',
    port: CLICKHOUSE_HTTPS_PORT,
    suffixes: ['.clickhouse.cloud'],
    type: ConnectionType.ClickHouse,
  },
  {
    label: 'Altinity.Cloud',
    port: CLICKHOUSE_HTTPS_PORT,
    suffixes: ['.altinity.cloud'],
    type: ConnectionType.ClickHouse,
  },
  {
    label: 'Oracle Autonomous Database',
    port: '1522',
    suffixes: ['.oraclecloud.com'],
    type: ConnectionType.Oracle,
  },
  {
    label: 'MongoDB Atlas',
    provider: Provider.MongoDBAtlas,
    suffixes: ['.mongodb.net'],
    type: ConnectionType.MongoDB,
  },
  { label: 'Aiven', suffixes: ['.aivencloud.com'] },
  {
    label: 'DigitalOcean',
    port: '25060',
    suffixes: ['.db.ondigitalocean.com'],
  },
  { label: 'Alibaba Cloud RDS', suffixes: ['.rds.aliyuncs.com'] },
]

export const TYPE_OF_PORT: Record<string, ConnectionType> = {
  ...Object.fromEntries(
    [
      ...Object.keys(CLICKHOUSE_HTTP_PORT_OF_NATIVE),
      ...Object.values(CLICKHOUSE_HTTP_PORT_OF_NATIVE),
    ].map((port) => [port, ConnectionType.ClickHouse])
  ),
  ...TYPE_OF_DEFAULT_PORT,
  5433: ConnectionType.Postgres,
  [SUPABASE_TRANSACTION_POOLER_PORT]: ConnectionType.Postgres,
  [PGBOUNCER_PORT]: ConnectionType.Postgres,
}

const LOCAL_HOSTS = new Set([
  'localhost',
  '0.0.0.0',
  '::',
  '[::]',
  '::1',
  '[::1]',
])
const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u
const PRIVATE_IPV4 =
  /^(?:10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/u
const PRIVATE_IPV6 = /^\[?(?:f[cd][\da-f]{2}|fe[89ab][\da-f]):/iu
const PRIVATE_NAME =
  /\.(?:internal|local|lan|svc|cluster\.local|corp|intranet|home\.arpa|ts\.net)$/iu

export const getHostHint = (host: string): HostHint | undefined => {
  const lowerHost = host.toLowerCase()
  return HOST_HINTS.find((hint) =>
    hint.suffixes.some((suffix) => lowerHost.endsWith(suffix))
  )
}

export const isLocalHost = (host: string) =>
  LOCAL_HOSTS.has(host.toLowerCase()) || LOOPBACK_IPV4.test(host)

const isPrivateHost = (host: string) =>
  PRIVATE_IPV4.test(host) || PRIVATE_IPV6.test(host) || PRIVATE_NAME.test(host)

const isServiceName = (host: string) =>
  !host.includes('.') && !host.includes(':')

export const isInternalHost = (host: string) =>
  isLocalHost(host) || isPrivateHost(host) || isServiceName(host)

export type HostKind = 'ipv6-only' | 'local' | 'private' | 'public' | 'service'

export const getHostKind = (host: string): HostKind => {
  if (isLocalHost(host)) {
    return 'local'
  }
  if (isServiceName(host)) {
    return 'service'
  }
  if (isPrivateHost(host)) {
    return 'private'
  }
  return getHostHint(host)?.ipv6Only?.test(host) ? 'ipv6-only' : 'public'
}

/** A pasted scheme or port already says how to reach the host, so only a bare one takes its provider from the hint. */
export const getBareHostProvider = ({
  host = '',
  port,
  type,
}: {
  host?: string
  port?: string
  type?: ConnectionType | null
}) => (type || port ? undefined : getHostHint(host)?.provider)
