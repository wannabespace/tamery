import type { Dialect } from '@tamery/shared/enums/connection-type'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { silently, toError } from '@tamery/shared/utils'
import type { Statement } from '@tamery/sql'
import { dialects, statementsFromTokens, unwrapTransaction } from '@tamery/sql'
import { type } from 'arktype'
import { Result } from 'better-result'
import { memoize } from 'memoza'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'
import { toast } from 'sonner'

import { refreshAfterRun } from '~/core/connection/refresh-after-run'
import type { ConnectionResource } from '~/core/connection/sync'
import type { ResultSet } from '~/core/queries/connection/custom'
import { customQuery } from '~/core/queries/connection/custom'
import { statementQuery } from '~/core/queries/connection/statement'
import { createDialectProvider } from '~/core/runtime/dialects/driver'
import { getQueryLanguage } from '~/core/runtime/language'
import type { QueryParams } from '~/core/runtime/query'
import { posthog } from '~/lib/posthog'
import { plural } from '~/utils/plural'

import type { RunnerStatement } from './run'
import type { RunnerTab } from './store'

interface OpenTransaction {
  connectionResource: ConnectionResource
  dialect: Dialect
  failed: boolean
  provider: ReturnType<typeof createDialectProvider>
  ran: Pick<RunnerStatement, 'start' | 'text'>[]
  txId: string
}

type CloseReason = 'commit' | 'ended' | 'rollback' | 'tab_closed'

export class SessionRefusedError extends Error {
  override name = 'SessionRefusedError'
}

const state = memoize((_tab: RunnerTab) =>
  createStore<OpenTransaction | null>(null)
)

// A reload loses every open transaction (the desktop main process rolls them back), so the next load says so.
const openTxIds = createWebStorageValue({
  defaultValue: [],
  key: 'runner-open-transactions',
  schema: type('string[]'),
  type: 'sessionStorage',
})

const lostTxCount = openTxIds.get().length
if (lostTxCount > 0) {
  openTxIds.set([])
  toast.info(`${plural(lostTxCount, 'transaction')} rolled back`, {
    description: 'The window reloaded',
  })
}

const close = async (tab: RunnerTab, reason: CloseReason) => {
  const open = state(tab).get()
  if (!open) {
    return
  }
  state(tab).set(null)
  const { connectionResource, dialect, provider, ran, txId } = open
  openTxIds.set((ids) => ids.filter((id) => id !== txId))
  posthog.capture('transaction_close', { reason, type: dialect })
  try {
    if (reason === 'commit') {
      await provider.commitTransaction({ txId })
    } else if (reason !== 'ended') {
      await provider.rollbackTransaction({ txId })
    }
  } finally {
    refreshAfterRun(
      connectionResource,
      dialect,
      ran.map((statement) => statement.text).join(';\n')
    )
  }
}

const open = async (
  tab: RunnerTab,
  connectionResource: ConnectionResource,
  params: QueryParams
) => {
  const provider = createDialectProvider(params.dialect, params)
  const session = await Result.tryPromise(() => provider.openSession())
  if (session.isErr()) {
    throw new SessionRefusedError(
      `The transaction could not stay open (${toError(session.error.cause).message}). Run the whole block with Run all, or select it, to use the app's own connection.`
    )
  }
  const { txId } = session.value
  // A newer run aborted this one while it connected and may already hold the tab's session.
  if (params.signal?.aborted) {
    await silently(() => provider.rollbackTransaction({ txId }))
    params.signal.throwIfAborted()
  }
  state(tab).set({
    connectionResource,
    dialect: params.dialect,
    failed: false,
    provider,
    ran: [],
    txId,
  })
  openTxIds.set((ids) => [...ids, txId])
  posthog.capture('transaction_open', { type: params.dialect })
  return txId
}

const sync = async (
  tab: RunnerTab,
  txId: string,
  last: { failed: boolean; text: string }
) => {
  const current = state(tab).get()
  if (current?.txId !== txId) {
    return
  }
  const status = await Result.tryPromise(() =>
    current.provider.transactionStatus({ txId })
  )
  if (status.isErr()) {
    return
  }
  if (status.value === 'ended') {
    if (current.failed) {
      toast.info('Transaction rolled back', {
        description: 'It had failed, so none of its changes were saved',
      })
    } else if (last.failed) {
      toast.warning('Transaction ended', {
        description: 'The database ended it when the statement failed',
      })
    } else if (!getQueryLanguage(current.dialect).endsTransaction(last.text)) {
      toast.info('Transaction committed', {
        description: 'The database committed it implicitly',
      })
    }
    await close(tab, 'ended')
    return
  }
  const failed = status.value === 'failed'
  if (failed && !current.failed) {
    toast.warning('Transaction failed', {
      description:
        'The database ignores further statements until you roll it back',
    })
  }
  state(tab).set((item) => item && { ...item, failed })
}

/** The statement's SQL runs verbatim: a `BEGIN` left open moves the tab onto a session of its own until the database reports its transaction over. */
const run = async ({
  connectionResource,
  params,
  statement,
  tab,
}: {
  connectionResource: ConnectionResource
  params: QueryParams
  statement: RunnerStatement
  tab: RunnerTab
}): Promise<ResultSet[]> => {
  const language = getQueryLanguage(params.dialect)
  const txId =
    state(tab).get()?.txId ??
    (language.transactions && language.leavesTransactionOpen(statement.text)
      ? await open(tab, connectionResource, params)
      : null)
  if (!txId) {
    return statementQuery(statement.text, params.dialect).run(params)
  }
  const sets: ResultSet[] = []
  const last = { failed: true, text: statement.text }
  try {
    // A `BEGIN … COMMIT` group goes one statement at a time: MySQL rejects several in one string.
    for (const part of language.split(statement.text, {
      groupTransactions: false,
    })) {
      last.text = part.text
      // Sequential by design: the statements run in order on the session's connection.
      // oxlint-disable-next-line no-await-in-loop
      const partSets = await customQuery({ query: part.text }).run({
        ...params,
        txId,
      })
      sets.push(...partSets)
      state(tab).set(
        (current) =>
          current && {
            ...current,
            ran: [
              ...current.ran,
              { start: statement.start + part.start, text: part.text },
            ],
          }
      )
    }
    last.failed = false
  } finally {
    await sync(tab, txId, last)
  }
  return sets
}

/** The statement of a `BEGIN … COMMIT` block whose turn it is: the one after the last of the block's statements that ran in the tab's transaction, else its opener. */
const step = ({
  dialect,
  statement,
  tab,
  text,
}: {
  dialect: Dialect
  statement: Statement
  tab: RunnerTab
  text: string
}) => {
  if (
    !isSqlDialect(dialect) ||
    !unwrapTransaction(statement.text, dialects[dialect])
  ) {
    return statement
  }
  const steps = statementsFromTokens(
    text,
    statement.tokens,
    dialects[dialect],
    {
      groupTransactions: false,
    }
  )
  const ran = new Set(
    state(tab)
      .get()
      ?.ran.map((item) => item.start)
  )
  const last = steps.findLastIndex((item) => ran.has(item.start))
  return steps[Math.min(last + 1, steps.length - 1)] ?? statement
}

export const runnerTransaction = { close, run, state, step }
