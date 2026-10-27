import type { BuilderWithMiddlewares, RouterClient } from '@orpc/server'
import { type } from '@orpc/server'
import type { QueryExecutor } from '@tamery/connection/queries'
import { executors } from '@tamery/connection/queries/executors'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import type { AnyFunction, Prettify } from '@tamery/shared/utils'

// oxlint-disable-next-line ts/no-explicit-any
export type AnyBuilder = BuilderWithMiddlewares<any, any, any>

type Params<
  T extends AnyFunction,
  P extends Parameters<T>[0] = Parameters<T>[0],
> = Prettify<
  P extends { connectionString: string }
    ? Omit<P, 'connectionString'> & ConnectionInput
    : P
>

type ConnectionInput =
  | { connectionString: string }
  | { connectionId: string }
  | { resourceId: string }

type HandlerContext<T extends AnyBuilder> = Parameters<
  Parameters<T['handler']>[0]
>[0]['context']

interface Resolvers<T extends AnyBuilder> {
  connectionString: (
    input: ConnectionInput,
    context: HandlerContext<T>
  ) => string | Promise<string>
  /** Who a transaction belongs to, so a leaked `txId` cannot drive another user's transaction. */
  owner: (context: HandlerContext<T>) => string
}

// A proxy serves many users at once; one unbounded result would hold its memory for all of them.
const MAX_ROWS = 100_000

const createQueryDialect = <T extends AnyBuilder>(
  dialect: QueryExecutor,
  orpc: T,
  resolve: Resolvers<T>
) =>
  ({
    beginTransaction: orpc
      .input(type<Params<typeof dialect.beginTransaction>>())
      .handler(async ({ input, context }) =>
        dialect.beginTransaction({
          ...input,
          connectionString: await resolve.connectionString(input, context),
          ownerId: resolve.owner(context),
        })
      ),
    cancel: orpc
      .input(type<Params<typeof dialect.cancel>>())
      .handler(async ({ input, context }) =>
        dialect.cancel({
          ...input,
          connectionString: await resolve.connectionString(input, context),
        })
      ),
    commitTransaction: orpc
      .input(type<Params<typeof dialect.commitTransaction>>())
      .handler(({ input, context }) =>
        dialect.commitTransaction({ ...input, ownerId: resolve.owner(context) })
      ),
    execute: orpc
      .input(type<Params<typeof dialect.execute>>())
      .handler(async ({ input, context }) =>
        dialect.execute({
          ...input,
          connectionString: await resolve.connectionString(input, context),
          maxRows: Math.min(input.maxRows ?? MAX_ROWS, MAX_ROWS),
        })
      ),
    executeTransaction: orpc
      .input(type<Params<typeof dialect.executeTransaction>>())
      .handler(({ input, context }) =>
        dialect.executeTransaction({
          ...input,
          maxRows: Math.min(input.maxRows ?? MAX_ROWS, MAX_ROWS),
          ownerId: resolve.owner(context),
        })
      ),
    openSession: orpc
      .input(type<Params<typeof dialect.openSession>>())
      .handler(async ({ input, context }) =>
        dialect.openSession({
          ...input,
          connectionString: await resolve.connectionString(input, context),
          ownerId: resolve.owner(context),
        })
      ),
    rollbackTransaction: orpc
      .input(type<Params<typeof dialect.rollbackTransaction>>())
      .handler(({ input, context }) =>
        dialect.rollbackTransaction({
          ...input,
          ownerId: resolve.owner(context),
        })
      ),
    transactionStatus: orpc
      .input(type<Params<typeof dialect.transactionStatus>>())
      .handler(({ input, context }) =>
        dialect.transactionStatus({ ...input, ownerId: resolve.owner(context) })
      ),
  }) satisfies Record<keyof QueryExecutor, unknown>

export const createQueryRouter = <T extends AnyBuilder>(
  orpc: T,
  resolve: Resolvers<T>
) =>
  ({
    clickhouse: createQueryDialect(executors.clickhouse, orpc, resolve),
    mongodb: createQueryDialect(executors.mongodb, orpc, resolve),
    mssql: createQueryDialect(executors.mssql, orpc, resolve),
    mysql: createQueryDialect(executors.mysql, orpc, resolve),
    oracle: createQueryDialect(executors.oracle, orpc, resolve),
    postgres: createQueryDialect(executors.postgres, orpc, resolve),
    sqlite: createQueryDialect(executors.sqlite, orpc, resolve),
  }) satisfies Record<Dialect, Record<keyof QueryExecutor, unknown>>

export type ORPCRouter = RouterClient<ReturnType<typeof createQueryRouter>>
