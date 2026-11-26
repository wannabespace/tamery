import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'
import { cancellable } from '@tamery/connection/queries/cancellation'
import {
  registerTransaction,
  transactionQueries,
} from '@tamery/connection/queries/transactions'
import { noop } from '@tamery/shared/utils'

import { createQueryRouter } from '.'

const builder = os.$context<{ userId: string }>()
const orpc = builder.use(builder.middleware(({ next }) => next()))
const router = createQueryRouter(orpc, {
  connection: (_input, context) => ({
    connectionString: '',
    ownerId: context.userId,
  }),
  owner: (context) => context.userId,
})

test('only the query owner can cancel a running query', async () => {
  const owner = { userId: 'owner-a' }
  const otherUser = { userId: 'owner-b' }
  const connectionString = 'postgres://db.example.test/test'
  const queryId = 'test-query'
  const caller = createQueryRouter(orpc, {
    connection: (_input, context) => ({
      connectionString,
      ownerId: context.userId,
    }),
    owner: (context) => context.userId,
  }).postgres
  const started = Promise.withResolvers<null>()
  const finished = Promise.withResolvers<null>()
  const cancel = mock(() => Promise.resolve())
  const txId = registerTransaction(
    {
      commit: noop,
      execute: (_query, _values, options) =>
        cancellable(
          {
            cancel,
            connectionString,
            queryId: options.queryId,
          },
          async () => {
            started.resolve(null)
            await finished.promise
            return { duration: 0, result: [] }
          }
        ),
      release: noop,
      rollback: noop,
    },
    owner.userId
  )
  const running = call(
    caller.executeTransaction,
    { query: 'SELECT 1', queryId, txId, values: [] },
    { context: owner }
  )
  try {
    await Promise.race([started.promise, running])
    const input = { connectionString, queryId }
    await call(caller.cancel, input, { context: otherUser })
    expect(cancel).not.toHaveBeenCalled()
    await call(caller.cancel, input, { context: owner })
    expect(cancel).toHaveBeenCalledTimes(1)
  } finally {
    finished.resolve(null)
    await running
    await transactionQueries.rollbackTransaction({
      ownerId: owner.userId,
      txId,
    })
  }
})

test('cloud transactions ignore a forged client owner for execute, commit and rollback', async () => {
  const beginInput = {
    connectionString: 'http://localhost:8123',
    ownerId: 'attacker',
  }
  const { txId } = await call(router.clickhouse.beginTransaction, beginInput, {
    context: { userId: 'owner' },
  })
  const forged = { ownerId: 'owner', query: 'SELECT 1', txId, values: [] }
  const context = { userId: 'attacker' }
  await expect(
    call(router.postgres.executeTransaction, forged, { context })
  ).rejects.toThrow('no longer open')
  await expect(
    call(router.postgres.commitTransaction, forged, { context })
  ).rejects.toThrow('no longer open')
  await call(router.postgres.rollbackTransaction, forged, { context })
  await expect(
    transactionQueries.executeTransaction({
      ownerId: 'attacker',
      query: 'SELECT 1',
      txId,
      values: [],
    })
  ).rejects.toThrow('no longer open')
  await transactionQueries.rollbackTransaction({ ownerId: 'owner', txId })
  await expect(
    call(router.postgres.commitTransaction, forged, {
      context: { userId: 'owner' },
    })
  ).rejects.toThrow('no longer open')
})
