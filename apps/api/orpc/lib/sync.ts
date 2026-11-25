import { RedisPublisher } from '@orpc/publisher/redis'
import type { InferSchemaInput } from '@orpc/server'
import { asyncIteratorObject } from '@orpc/server'
import { db } from '@tamery/db'
import type { Type } from 'arktype'
import { type } from 'arktype'
import { addMilliseconds } from 'date-fns'
import type { SQLWrapper } from 'drizzle-orm'
import { and, eq, gte, inArray, notInArray, or } from 'drizzle-orm'
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

// Postgres keeps microseconds a device never sees, so a plain `>` resends every `defaultNow()` row; any slack past 1ms drops the edits inside it.
export const updatedAfter = (updatedAt: SQLWrapper, known: Date) =>
  gte(updatedAt, addMilliseconds(known, 1))

export const syncDiff = async <TItem>(opts: {
  input: { id: string; updatedAt: Date }[]
  queries: {
    updated?: (
      inputItems: { id: string; updatedAt: Date }[]
    ) => Promise<TItem[]>
    new: (excludeIds: string[]) => Promise<TItem[]>
    existing: (includeIds: string[]) => Promise<string[]>
  }
}) => {
  const inputIds = opts.input.map((i) => i.id)
  const [updatedItems, newItems, existingIds] = await Promise.all([
    inputIds.length > 0 && opts.queries.updated
      ? opts.queries.updated(opts.input)
      : ([] as TItem[]),
    opts.queries.new(inputIds),
    opts.queries.existing(inputIds),
  ])
  const missingIds = inputIds.filter((id) => !existingIds.includes(id))
  return { missingIds, newItems, updatedItems }
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
          existing: (includeIds) =>
            db
              .select({ id: table.id })
              .from(table)
              .where(and(ownRows, inArray(table.id, includeIds)))
              .then((rows) => rows.map((row) => row.id)),
          new: (excludeIds) =>
            db
              .select()
              .from(table)
              .where(and(ownRows, notInArray(table.id, excludeIds))),
          updated: (items) =>
            db
              .select()
              .from(table)
              .where(
                and(
                  ownRows,
                  or(
                    ...items.map((row) =>
                      and(
                        eq(table.id, row.id),
                        updatedAfter(table.updatedAt, row.updatedAt)
                      )
                    )
                  )
                )
              ),
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
