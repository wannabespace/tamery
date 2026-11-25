import { RedisPublisher } from '@orpc/publisher/redis'
import type { InferSchemaInput } from '@orpc/server'
import { asyncIteratorObject } from '@orpc/server'
import { db } from '@tamery/db'
import type { Type } from 'arktype'
import { type } from 'arktype'
import { and, eq, getColumns, sql } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'

import { redis, redisSubscriber } from '~/lib/redis'
import { authMiddleware, orpc } from '~/orpc'

export function createSyncOutputSchema<const T>(
  schema: type.validate<T>
): type.instantiate<
  | { type: '"insert"'; value: T }
  | { type: '"update"'; value: T }
  | { type: '"delete"'; key: 'string.uuid.v7' }
>
export function createSyncOutputSchema(schema: Type) {
  return type.or(
    type({ type: '"insert"', value: schema }),
    type({ type: '"update"', value: schema }),
    type({ key: 'string.uuid.v7', type: '"delete"' })
  )
}

export const createSyncPublisher = <
  T extends Type<{ type: 'insert' | 'update' | 'delete' }>,
>(
  _output: T,
  prefix: string
) =>
  new RedisPublisher<Record<string, T['inferIn']>>(redis, {
    prefix,
    subscriber: redisSubscriber,
  })

interface Version {
  id: string
  updatedAt: Date
}

/** One bound array, not a parameter per id: Postgres refuses a statement with more than 65535 parameters. */
export const idIn = (column: AnyPgColumn, ids: string[]) =>
  sql`${column} = any(${sql.param(ids)}::uuid[])`

export const syncDiff = async <TItem extends { id: string }>(opts: {
  input: Version[]
  queries: {
    versions: () => Promise<Version[]>
    rows: (ids: string[]) => Promise<TItem[]>
  }
}) => {
  const clientVersions = new Map(
    opts.input.map((item) => [item.id, item.updatedAt])
  )
  const versions = await opts.queries.versions()
  const changedIds = versions
    .filter(({ id, updatedAt }) => {
      const known = clientVersions.get(id)
      // Both sides hold the millisecond Date the driver read, so any slack added here hides edits made inside it.
      return !known || updatedAt.getTime() > known.getTime()
    })
    .map(({ id }) => id)
  const changed =
    changedIds.length > 0 ? await opts.queries.rows(changedIds) : []
  const serverIds = new Set(versions.map(({ id }) => id))

  return {
    missingIds: opts.input
      .map(({ id }) => id)
      .filter((id) => !serverIds.has(id)),
    newItems: changed.filter(({ id }) => !clientVersions.has(id)),
    updatedItems: changed.filter(({ id }) => clientVersions.has(id)),
  }
}

export const createUserScopedSync = <
  O extends Type<{ type: 'insert' | 'update' | 'delete' }[]>,
>(
  table: PgTable &
    Record<'id' | 'userId', AnyPgColumn<{ data: string; notNull: true }>> &
    Record<'updatedAt', AnyPgColumn<{ data: Date; notNull: true }>>,
  output: O
) =>
  orpc
    .use(authMiddleware)
    .input(type({ id: 'string.uuid.v7', updatedAt: 'Date' }).array())
    .output(output)
    .handler(async ({ input, context }) => {
      const ownRows = eq(table.userId, context.user.id)
      const { updatedItems, newItems, missingIds } = await syncDiff({
        input,
        queries: {
          rows: (ids) =>
            db
              .select({ ...getColumns(table), id: table.id })
              .from(table)
              .where(and(ownRows, idIn(table.id, ids))),
          versions: () =>
            db
              .select({ id: table.id, updatedAt: table.updatedAt })
              .from(table)
              .where(ownRows),
        },
      })

      // Drizzle cannot infer a row from a generic table (`T['$inferSelect']`, `.from(T)` both fail as of 1.0.0-rc.6); `.output` validates it.
      return [
        ...updatedItems.map((value) => ({ type: 'update', value })),
        ...newItems.map((value) => ({ type: 'insert', value })),
        ...missingIds.map((key) => ({ key, type: 'delete' })),
      ] as InferSchemaInput<O>
    })

export const createEventsEndpoint = <
  O extends Type<{ type: 'insert' | 'update' | 'delete' }>,
>(
  output: O,
  publisher: ReturnType<typeof createSyncPublisher<O>>
) =>
  orpc
    .use(authMiddleware)
    .output(asyncIteratorObject(output))
    .handler(async function* eventsHandler({ context, signal, lastEventId }) {
      for await (const payload of publisher.subscribe(context.user.id, {
        lastEventId,
        signal,
      })) {
        yield payload as O['inferIn'] extends infer TPayload ? TPayload : never
      }
    })
