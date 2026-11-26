import { type } from 'arktype'
import type { Kysely, RawBuilder } from 'kysely'
import { sql } from 'kysely'

import type { Database as OracleDatabase } from '~/core/runtime/dialects/oracle/schema'

import { mssqlQualified } from './sql-fragments'

export const definitionType = type({ definition: 'string | null' }).pipe(
  ({ definition }) => definition ?? ''
)

export const readDefinition =
  (expression: RawBuilder<string | null>) =>
  // oxlint-disable-next-line ts/no-explicit-any
  async (db: Kysely<any>) => {
    const row = await db
      .selectNoFrom(expression.as('definition'))
      .executeTakeFirst()

    return { definition: row?.definition ?? null }
  }

// Oracle commits each DDL statement, so only the object's saved DDL brings it back when its replacement fails.
export const replaceWithSavedDdl = async (
  db: Kysely<OracleDatabase>,
  {
    create,
    drop,
    savedDdl,
  }: {
    create: () => Promise<unknown>
    drop: () => Promise<unknown>
    savedDdl: RawBuilder<string | null>
  }
) => {
  const { definition } = await readDefinition(savedDdl)(db)

  if (!definition) {
    throw new Error(
      'Cannot read the saved DDL, so a failed save could not restore it.'
    )
  }
  await drop()
  try {
    await create()
  } catch (error) {
    await sql.raw(definition).execute(db)
    throw error
  }
}

const headerEnd = /(?<preceding>\S+)\s+AS\s/giu
const parameterName = /@\w+$/u

export const UNREADABLE_BODY = null

export const mssqlModuleParts = (
  definition: string | typeof UNREADABLE_BODY
) => {
  if (!definition) {
    return UNREADABLE_BODY
  }

  for (const match of definition.matchAll(headerEnd)) {
    const [matched] = match
    const preceding = match.groups?.preceding ?? ''

    if (
      parameterName.test(preceding) ||
      preceding.toUpperCase() === 'EXECUTE'
    ) {
      continue
    }
    const end = match.index + matched.length

    return { body: definition.slice(end), header: definition.slice(0, end) }
  }

  return UNREADABLE_BODY
}

export const mssqlModuleBody = (definition: string | typeof UNREADABLE_BODY) =>
  mssqlModuleParts(definition)?.body ?? UNREADABLE_BODY

export const mssqlObjectDefinition = (schema: string, name: string) =>
  sql<
    string | null
  >`OBJECT_DEFINITION(OBJECT_ID(${sql.lit(mssqlQualified(schema, name))}))`
