import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'
import { ClickHouseIcon } from '@tamery/ui/components/icons/clickhouse'
import { CloudflareD1Icon } from '@tamery/ui/components/icons/cloudflare-d1'
import { MariaDBIcon } from '@tamery/ui/components/icons/mariadb'
import { MongoIcon } from '@tamery/ui/components/icons/mongo'
import { MSSQLIcon } from '@tamery/ui/components/icons/mssql'
import { MySQLIcon } from '@tamery/ui/components/icons/mysql'
import { OracleIcon } from '@tamery/ui/components/icons/oracle'
import { PostgresIcon } from '@tamery/ui/components/icons/postgres'
import { SQLiteIcon } from '@tamery/ui/components/icons/sqlite'
import { TursoIcon } from '@tamery/ui/components/icons/turso'
import type { ComponentProps, ReactNode } from 'react'
import { createElement } from 'react'

const iconMap: Record<
  ConnectionType | Provider,
  (props: ComponentProps<'svg'>) => ReactNode
> = {
  [ConnectionType.MariaDB]: MariaDBIcon,
  [ConnectionType.Postgres]: PostgresIcon,
  [ConnectionType.MySQL]: MySQLIcon,
  [ConnectionType.ClickHouse]: ClickHouseIcon,
  [ConnectionType.MSSQL]: MSSQLIcon,
  [ConnectionType.SQLite]: SQLiteIcon,
  [ConnectionType.Oracle]: OracleIcon,
  [ConnectionType.MongoDB]: MongoIcon,
  [Provider.CloudflareD1]: CloudflareD1Icon,
  [Provider.MongoDBAtlas]: MongoIcon,
  [Provider.Turso]: TursoIcon,
}

export const ConnectionIcon = ({
  provider,
  type,
  ...props
}: {
  provider?: Provider | null
  type: ConnectionType
} & ComponentProps<'svg'>) => createElement(iconMap[provider ?? type], props)
