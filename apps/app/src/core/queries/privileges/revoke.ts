import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { PrivilegeTarget } from './shape'
import { ALL_TABLES, getAccount, privilegeOn } from './shape'

const GRANT_OPTION_ONLY = 'USAGE'

export const revokePrivilegeQuery = (target: PrivilegeTarget) =>
  createQuery({
    query: {
      clickhouse: unsupported('Privileges'),
      mongodb: unsupported('Privileges'),
      mssql: unsupported('Privileges'),
      // MySQL keeps GRANT OPTION per database or table, not per privilege:
      // revoking the last privilege leaves it behind as a USAGE row.
      mysql: async (db) => {
        const revoke = (privilege: string) =>
          sql`REVOKE ${privilegeOn({ ...target, privilege })} FROM ${getAccount(target.grantee)}`.execute(
            db
          )

        if (target.privilege === GRANT_OPTION_ONLY) {
          await revoke('GRANT OPTION')
          return
        }
        await revoke(target.privilege)
        if (!target.grantable) {
          return
        }
        const { rows } = await sql`SELECT 1 FROM ${sql.table(
          target.table === ALL_TABLES
            ? 'information_schema.SCHEMA_PRIVILEGES'
            : 'information_schema.TABLE_PRIVILEGES'
        )} WHERE GRANTEE = ${target.grantee} AND TABLE_SCHEMA = ${target.schema}${
          target.table === ALL_TABLES
            ? sql``
            : sql` AND TABLE_NAME = ${target.table}`
        } AND PRIVILEGE_TYPE = ${GRANT_OPTION_ONLY}`.execute(db)
        if (rows.length > 0) {
          await revoke('GRANT OPTION')
        }
      },
      oracle: unsupported('Privileges'),
      postgres: unsupported('Privileges'),
      sqlite: unsupported('Privileges'),
    },
  })
