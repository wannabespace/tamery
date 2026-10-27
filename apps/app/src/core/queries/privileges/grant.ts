import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { PrivilegeTarget } from './shape'
import { ALL_TABLES, getAccount, privilegeOn } from './shape'

export const grantPrivilegeQuery = (target: PrivilegeTarget) =>
  createQuery({
    query: {
      clickhouse: unsupported('Privileges'),
      mongodb: unsupported('Privileges'),
      mssql: unsupported('Privileges'),
      // A database-wide grant takes a LIKE pattern: unescaped, `my_db` also
      // covers `myXdb`.
      mysql: async (db) => {
        try {
          await sql`GRANT ${privilegeOn(
            target.table === ALL_TABLES
              ? {
                  ...target,
                  schema: target.schema.replaceAll(/[\\%_]/gu, '\\$&'),
                }
              : target
          )} TO ${getAccount(target.grantee)}${target.grantable ? sql` WITH GRANT OPTION` : sql``}`.execute(
            db
          )
        } catch (error) {
          // MySQL 8 never creates an account through GRANT, and says so
          // with a message that reads like a missing privilege.
          if (
            error instanceof Error &&
            /not allowed to create a user with grant/iu.test(error.message)
          ) {
            throw new Error(
              `The account ${target.grantee} doesn't exist. Create it first, then grant the privilege.`,
              { cause: error }
            )
          }
          throw error
        }
      },
      oracle: unsupported('Privileges'),
      postgres: unsupported('Privileges'),
      sqlite: unsupported('Privileges'),
    },
  })
