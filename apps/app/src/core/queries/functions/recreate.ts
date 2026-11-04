import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { plsqlUnit } from '~/core/queries/shared/plsql'
import { createQuery } from '~/core/runtime/query'

import type { FunctionShape, RoutineTarget } from './shape'
import {
  createFunctionStatements,
  dropRoutineStatements,
  routineKeyword,
  routineType,
} from './shape'

// replacesObject marks a signature the engine cannot replace in place.
export const recreateFunctionQuery = ({
  replacesObject,
  shape,
  ...target
}: RoutineTarget & { replacesObject: boolean; shape: FunctionShape }) => {
  const create = createFunctionStatements({
    replace: true,
    schema: target.schema,
    shape,
  })
  const drop = dropRoutineStatements(target)

  return createQuery({
    query: {
      clickhouse: unsupported('Functions'),
      mongodb: unsupported('Functions'),
      mssql: (db) =>
        db.transaction().execute(async (tx) => {
          if (replacesObject) {
            await drop.mssql.execute(tx)
          }
          await create.mssql.execute(tx)
        }),
      mysql: async (db) => {
        const saved = await db
          .selectFrom('information_schema.ROUTINES')
          .select('DEFINER')
          .where('ROUTINE_SCHEMA', '=', target.schema)
          .where('ROUTINE_NAME', '=', target.name)
          .where('ROUTINE_TYPE', '=', routineType(target.kind))
          .executeTakeFirst()
        const column =
          target.kind === 'procedure' ? 'Create Procedure' : 'Create Function'
        const {
          rows: [original],
        } = await sql<
          Record<string, string | null>
        >`SHOW CREATE ${routineKeyword(target.kind)} ${sql.id(target.schema, target.name)}`.execute(
          db
        )

        await drop.mysql.execute(db)
        try {
          await createFunctionStatements({
            definer: saved?.DEFINER,
            replace: true,
            schema: target.schema,
            shape,
          }).mysql.execute(db)
        } catch (error) {
          // MySQL commits the drop at once, so only its saved statement brings the routine back.
          const statement = original?.[column]

          if (statement) {
            await sql.raw(statement).execute(db)
          }
          throw error
        }
      },
      oracle: (db) =>
        plsqlUnit.save(db, {
          body: shape.body,
          create: (replace) =>
            createFunctionStatements({ replace, schema: target.schema, shape })
              .oracle,
          original: {
            name: target.name,
            schema: target.schema,
            type: routineType(target.kind),
          },
          unit: {
            name: shape.name,
            schema: target.schema,
            type: routineType(shape.kind),
          },
        }),
      postgres: (db) =>
        db.transaction().execute(async (tx) => {
          if (replacesObject) {
            await drop.postgres.execute(tx)
          }
          await create.postgres.execute(tx)
        }),
      sqlite: unsupported('Functions'),
    },
  })
}
