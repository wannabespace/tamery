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
import type { AnyFunction, Prettify } from '@tamery/shared/utils'

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
   * errors the caller's builder declares.
   */
  connectionString: (
    input: ConnectionInput,
    context: TContext,
    dialect: Dialect,
    errors: ORPCErrorConstructorMap<TErrors>
  ) => string | Promise<string>
  /** Who a transaction belongs to, so a leaked `txId` cannot drive another user's transaction. */
  owner: (context: TContext) => string
}

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
          connectionString: await resolve.connectionString(
            input,
            context,
            name,
            errors
          ),
          ownerId: resolve.owner(context),
        })
      ),
    cancel: orpc
      .input(type<Params<typeof dialect.cancel>>())
      .handler(async ({ context, errors, input }) =>
        dialect.cancel({
          ...input,
          connectionString: await resolve.connectionString(
            input,
            context,
            name,
            errors
          ),
        })
      ),
    commitTransaction: orpc
      .input(type<Params<typeof dialect.commitTransaction>>())
      .handler(({ input, context }) =>
        dialect.commitTransaction({ ...input, ownerId: resolve.owner(context) })
      ),
    execute: orpc
      .input(type<Params<typeof dialect.execute>>())
      .handler(async ({ context, errors, input }) =>
        dialect.execute({
          ...input,
          connectionString: await resolve.connectionString(
            input,
            context,
            name,
            errors
          ),
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
      .handler(async ({ context, errors, input }) =>
        dialect.openSession({
          ...input,
          connectionString: await resolve.connectionString(
            input,
            context,
            name,
            errors
          ),
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
