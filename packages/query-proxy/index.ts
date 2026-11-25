import { createHash } from 'node:crypto'

import type {
  BuilderWithMiddlewares,
  Context,
  ErrorMap,
  MergedContext,
  ORPCErrorConstructorMap,
  RouterClient,
} from '@orpc/server'
import { type } from '@orpc/server'
import type { QueryExecutor } from '@tamery/connection/queries'
import { executors } from '@tamery/connection/queries/executors'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { AnyFunction, MaybePromise, Prettify } from '@tamery/shared/utils'

type Params<
  T extends AnyFunction,
  P extends Parameters<T>[0] = Parameters<T>[0],
> = Prettify<
  P extends { connectionString: string }
    ? Omit<P, 'connectionString'> & ConnectionInput
    : P
>

export type ConnectionInput =
  | { connectionString: string }
  | { connectionId: string; resourceName?: string | null }
  | { resourceId: string }

interface Resolvers<TContext, TErrors extends ErrorMap> {
  /**
   * `dialect` is the executor that will run the string, which may not be the one its connection names; `errors` builds the
   * errors the caller's builder declares. Returns the query's owner too, so a resolver that learns the caller while resolving
   * needs no separate `owner` lookup.
   */
  connection: (
    input: ConnectionInput,
    context: TContext,
    dialect: Dialect,
    errors: ORPCErrorConstructorMap<TErrors>
  ) => MaybePromise<{ connectionString: string; ownerId: string }>
  owner: (context: TContext) => MaybePromise<string>
}

const getScopedQueryId = (ownerId: string, queryId: string) =>
  createHash('sha256')
    .update(JSON.stringify([ownerId, queryId]))
    .digest('hex')

// A proxy serves many users at once; one unbounded result would hold its memory for all of them.
const MAX_ROWS = 100_000

const createQueryDialect = <
  TInitial extends Context,
  TInjected extends Context,
  TErrors extends ErrorMap,
>(
  name: Dialect,
  orpc: BuilderWithMiddlewares<TInitial, TInjected, TErrors>,
  resolve: Resolvers<MergedContext<TInitial, TInjected>, TErrors>
) => {
  const dialect = executors[name]
  return {
    beginTransaction: orpc
      .input(type<Params<typeof dialect.beginTransaction>>())
      .handler(async ({ context, errors, input }) =>
        dialect.beginTransaction({
          ...input,
          ...(await resolve.connection(input, context, name, errors)),
        })
      ),
    cancel: orpc
      .input(type<Params<typeof dialect.cancel>>())
      .handler(async ({ context, errors, input }) => {
        const { connectionString, ownerId } = await resolve.connection(
          input,
          context,
          name,
          errors
        )
        return dialect.cancel({
          ...input,
          connectionString,
          queryId: getScopedQueryId(ownerId, input.queryId),
        })
      }),
    commitTransaction: orpc
      .input(type<Params<typeof dialect.commitTransaction>>())
      .handler(async ({ input, context }) =>
        dialect.commitTransaction({
          ...input,
          ownerId: await resolve.owner(context),
        })
      ),
    execute: orpc
      .input(type<Params<typeof dialect.execute>>())
      .handler(async ({ context, errors, input }) => {
        const { connectionString, ownerId } = await resolve.connection(
          input,
          context,
          name,
          errors
        )
        return dialect.execute({
          ...input,
          connectionString,
          maxRows: Math.min(input.maxRows ?? MAX_ROWS, MAX_ROWS),
          queryId: input.queryId
            ? getScopedQueryId(ownerId, input.queryId)
            : undefined,
        })
      }),
    executeTransaction: orpc
      .input(type<Params<typeof dialect.executeTransaction>>())
      .handler(async ({ input, context }) => {
        const ownerId = await resolve.owner(context)
        return dialect.executeTransaction({
          ...input,
          maxRows: Math.min(input.maxRows ?? MAX_ROWS, MAX_ROWS),
          ownerId,
          queryId: input.queryId
            ? getScopedQueryId(ownerId, input.queryId)
            : undefined,
        })
      }),
    openSession: orpc
      .input(type<Params<typeof dialect.openSession>>())
      .handler(async ({ context, errors, input }) =>
        dialect.openSession({
          ...input,
          ...(await resolve.connection(input, context, name, errors)),
        })
      ),
    rollbackTransaction: orpc
      .input(type<Params<typeof dialect.rollbackTransaction>>())
      .handler(async ({ input, context }) =>
        dialect.rollbackTransaction({
          ...input,
          ownerId: await resolve.owner(context),
        })
      ),
    transactionStatus: orpc
      .input(type<Params<typeof dialect.transactionStatus>>())
      .handler(async ({ input, context }) =>
        dialect.transactionStatus({
          ...input,
          ownerId: await resolve.owner(context),
        })
      ),
  } satisfies Record<keyof QueryExecutor, unknown>
}

/** Generic over the builder's parts, not the builder, so the error map a caller declares reaches its clients' types. */
export const createQueryRouter = <
  TInitial extends Context,
  TInjected extends Context,
  TErrors extends ErrorMap,
>(
  orpc: BuilderWithMiddlewares<TInitial, TInjected, TErrors>,
  resolve: Resolvers<MergedContext<TInitial, TInjected>, TErrors>
) =>
  ({
    clickhouse: createQueryDialect(Dialect.ClickHouse, orpc, resolve),
    duckdb: createQueryDialect(Dialect.DuckDB, orpc, resolve),
    mongodb: createQueryDialect(Dialect.MongoDB, orpc, resolve),
    mssql: createQueryDialect(Dialect.MSSQL, orpc, resolve),
    mysql: createQueryDialect(Dialect.MySQL, orpc, resolve),
    oracle: createQueryDialect(Dialect.Oracle, orpc, resolve),
    postgres: createQueryDialect(Dialect.Postgres, orpc, resolve),
    sqlite: createQueryDialect(Dialect.SQLite, orpc, resolve),
  }) satisfies Record<Dialect, Record<keyof QueryExecutor, unknown>>

export type ORPCRouter = RouterClient<ReturnType<typeof createQueryRouter>>
