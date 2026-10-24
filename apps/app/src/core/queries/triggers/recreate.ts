import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { plsqlUnit } from '~/core/queries/shared/plsql'
import { createQuery } from '~/core/runtime/query'

import type { TriggerShape, TriggerTarget } from './shape'
import {
  createTriggerStatements,
  dropTriggerStatements,
  setTriggerEnabledStatements,
} from './shape'

export const recreateTriggerQuery = ({
  enabled,
  mode,
  name,
  schema,
  shape,
  table,
}: TriggerTarget & {
  enabled: boolean | null
  mode: string
  name: string
  shape: TriggerShape
}) => {
  const drop = dropTriggerStatements({ name, schema, table })
  const create = createTriggerStatements({ schema, shape, table })
  const restore =
    enabled === false || mode !== 'O'
      ? setTriggerEnabledStatements({
          enabled: enabled !== false,
          mode,
          name: shape.name,
          schema,
          table,
        })
      : undefined

  return createQuery({
    query: {
      clickhouse: unsupported('Triggers'),
      mongodb: unsupported('Triggers'),
      mssql: (db) =>
        db.transaction().execute(async (tx) => {
          await drop.mssql.execute(tx)
          await create.mssql.execute(tx)
          await restore?.mssql.execute(tx)
        }),
      mysql: async (db) => {
        const saved = await db
          .selectFrom('information_schema.TRIGGERS')
          .select('DEFINER')
          .where('TRIGGER_SCHEMA', '=', schema)
          .where('TRIGGER_NAME', '=', name)
          .executeTakeFirst()
        const {
          rows: [original],
        } = await sql<{
          'SQL Original Statement': string | null
        }>`SHOW CREATE TRIGGER ${sql.id(schema, name)}`.execute(db)

        await drop.mysql.execute(db)
        try {
          await createTriggerStatements({
            definer: saved?.DEFINER,
            schema,
            shape,
            table,
          }).mysql.execute(db)
        } catch (error) {
          // MySQL commits the drop at once, so only its saved statement brings the trigger back.
          const statement = original?.['SQL Original Statement']

          if (statement) {
            await sql.raw(statement).execute(db)
          }
          throw error
        }
      },
      oracle: async (db) => {
        await plsqlUnit.save(db, {
          body: shape.body,
          create: (replace) =>
            createTriggerStatements({ replace, schema, shape, table }).oracle,
          original: { name, schema, type: 'TRIGGER' },
          restored:
            enabled === false
              ? setTriggerEnabledStatements({
                  enabled,
                  mode,
                  name,
                  schema,
                  table,
                }).oracle
              : undefined,
          unit: { name: shape.name, schema, type: 'TRIGGER' },
        })
        await restore?.oracle.execute(db)
      },
      postgres: (db) =>
        db.transaction().execute(async (tx) => {
          await drop.postgres.execute(tx)
          await create.postgres.execute(tx)
          await restore?.postgres.execute(tx)
        }),
      sqlite: (db) =>
        db.transaction().execute(async (tx) => {
          await drop.sqlite.execute(tx)
          await create.sqlite.execute(tx)
        }),
    },
  })
}
