import { randomUUID } from 'node:crypto'

import type { MaybePromise } from '@tamery/shared/utils'
import { silently } from '@tamery/shared/utils'

import type {
  QueryExecuteResult,
  QueryExecutor,
  RunOptions,
  TransactionStatus,
} from '.'
import { handleQueryError } from '.'

export interface TxHandle {
  execute: (
    query: string,
    values: unknown[],
    options: RunOptions
  ) => Promise<QueryExecuteResult>
  commit: () => MaybePromise<void>
  rollback: () => MaybePromise<void>
  release: () => MaybePromise<void>
  status?: () => Promise<TransactionStatus>
}

interface OwnedTx {
  handle: TxHandle
  keepAlive: () => void
  ownerId?: string
}

const IDLE_TX_TIMEOUT_MINUTES = 15

const TRANSACTION_GONE = `The transaction is no longer open. One left idle for ${IDLE_TX_TIMEOUT_MINUTES} minutes, or open during a Tamery update, rolls back.`

const activeTransactions = new Map<string, OwnedTx>()

export const registerTransaction = (handle: TxHandle, ownerId?: string) => {
  const txId = randomUUID()
  let timeout: ReturnType<typeof setTimeout> | undefined

  const keepAlive = () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      void (async () => {
        const current = activeTransactions.get(txId)
        if (!current) {
          return
        }
        activeTransactions.delete(txId)
        await silently(() => current.handle.rollback())
        await silently(() => current.handle.release())
      })()
    }, IDLE_TX_TIMEOUT_MINUTES * 60_000)
  }

  const wrapped: TxHandle = {
    ...handle,
    release: async () => {
      clearTimeout(timeout)
      await handle.release()
    },
  }

  activeTransactions.set(txId, { handle: wrapped, keepAlive, ownerId })
  keepAlive()

  return txId
}

const owned = (entry: OwnedTx, ownerId?: string) =>
  !entry.ownerId || ownerId === entry.ownerId

const requireTransaction = (txId: string, ownerId?: string) => {
  const entry = activeTransactions.get(txId)
  if (!entry || !owned(entry, ownerId)) {
    throw new Error(TRANSACTION_GONE)
  }
  return entry
}

const disposeTransaction = (txId: string, ownerId?: string) => {
  const entry = activeTransactions.get(txId)
  if (!entry || !owned(entry, ownerId)) {
    return
  }
  activeTransactions.delete(txId)
  return entry.handle
}

const settle = async (handle: TxHandle, finish: () => MaybePromise<void>) => {
  try {
    await finish()
  } finally {
    await silently(() => handle.release())
  }
}

export const transactionQueries = {
  commitTransaction: handleQueryError(
    async ({ txId, ownerId }: { txId: string; ownerId?: string }) => {
      const handle = disposeTransaction(txId, ownerId)
      if (!handle) {
        throw new Error(TRANSACTION_GONE)
      }
      await settle(handle, () => handle.commit())
    }
  ),
  executeTransaction: handleQueryError(
    async ({
      query,
      txId,
      values,
      ownerId,
      ...options
    }: {
      txId: string
      query: string
      values: unknown[]
      ownerId?: string
    } & RunOptions) => {
      const entry = requireTransaction(txId, ownerId)
      entry.keepAlive()
      try {
        return await entry.handle.execute(query, values, options)
      } finally {
        entry.keepAlive()
      }
    }
  ),
  rollbackTransaction: handleQueryError(
    async ({ txId, ownerId }: { txId: string; ownerId?: string }) => {
      const handle = disposeTransaction(txId, ownerId)
      if (!handle) {
        return
      }
      await settle(handle, () => handle.rollback())
    }
  ),
  transactionStatus: handleQueryError(
    async ({ txId, ownerId }: { txId: string; ownerId?: string }) => {
      const entry = activeTransactions.get(txId)
      if (!entry || !owned(entry, ownerId)) {
        return 'ended'
      }
      const status = (await entry.handle.status?.()) ?? 'open'
      if (status === 'ended') {
        await silently(() => disposeTransaction(txId, ownerId)?.release())
      }
      return status
    }
  ),
} satisfies Pick<
  QueryExecutor,
  | 'commitTransaction'
  | 'executeTransaction'
  | 'rollbackTransaction'
  | 'transactionStatus'
>

export const resetTransactions = async () => {
  const entries = [...activeTransactions.values()]
  activeTransactions.clear()

  await Promise.all(
    entries.map(async ({ handle }) => {
      await silently(() => handle.rollback())
      await silently(() => handle.release())
    })
  )
}
