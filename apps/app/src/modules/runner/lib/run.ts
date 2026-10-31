import { silently, toError } from '@tamery/shared/utils'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { Result } from 'better-result'
import { toast } from 'sonner'

import { refreshAfterRun } from '~/core/connection/refresh-after-run'
import { getConnectionResourceStore } from '~/core/connection/stores'
import type { ConnectionResource } from '~/core/connection/sync'
import type { ResultSet } from '~/core/queries/connection/custom'
import { getQueryLanguage } from '~/core/runtime/language'
import type { QueryParams } from '~/core/runtime/query'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import type { HistoryEntry } from './history'
import { runHistory } from './history'
import type { RunnerTab } from './store'
import { runnerTransaction, SessionRefusedError } from './transaction'

export interface RunnerStatement {
  text: string
  source: string
  start: number
  end: number
}

export interface RunnerError {
  /** `block`: a `BEGIN … COMMIT` block the failure rolled back whole; `connection`: no fix to the SQL makes the run start. */
  kind: 'block' | 'connection' | 'statement'
  message: string
}

export interface RunnerResult extends Omit<RunnerStatement, 'text'> {
  duration: number
  set: ResultSet | null
  error: RunnerError | null
  stopped: boolean
  skipped: boolean
  pending: boolean
}

export type FailedRunnerResult = RunnerResult & { error: RunnerError }

export interface RunnerRun {
  id: string
  results: RunnerResult[]
  running: boolean
}

const MAX_RESULT_ROWS = 10_000

export const runnerResultsOptions = ({ resourceId, tabId }: RunnerTab) =>
  queryOptions<RunnerRun>({
    // Results outlive the view: switching tabs must not drop them. Closing the tab removes them.
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: skipToken,
    queryKey: ['query-runner', resourceId, tabId],
  })

const runs = new Map<string, AbortController>()
const watchedTabs = new Set<string>()
const runKey = ({ resourceId, tabId }: RunnerTab) => `${resourceId}\n${tabId}`

const watchTab = (tab: RunnerTab) => {
  const key = runKey(tab)
  if (watchedTabs.has(key)) {
    return
  }
  watchedTabs.add(key)
  const unsubscribe = getConnectionResourceStore(tab.resourceId).subscribe(
    (state) => {
      if (state.tabs.some((item) => item.id === tab.tabId)) {
        return
      }
      runs.get(key)?.abort()
      if (runnerTransaction.state(tab).get()) {
        void silently(() => runnerTransaction.close(tab, 'tab_closed'))
        toast.info('Transaction rolled back', {
          description: 'Its query tab was closed',
        })
      }
      queryClient.removeQueries({
        queryKey: runnerResultsOptions(tab).queryKey,
      })
      watchedTabs.delete(key)
      unsubscribe()
    }
  )
}

const getResult = (
  statement: RunnerStatement,
  patch: Partial<RunnerResult> = {}
): RunnerResult => ({
  duration: 0,
  end: statement.end,
  error: null,
  pending: false,
  set: null,
  skipped: false,
  source: statement.source,
  start: statement.start,
  stopped: false,
  ...patch,
})

const runOne = async ({
  connectionResource,
  params,
  signal,
  statement,
  tab,
}: {
  connectionResource: ConnectionResource
  params: QueryParams
  signal: AbortSignal
  statement: RunnerStatement
  tab: RunnerTab
}): Promise<RunnerResult[]> => {
  const startedAt = performance.now()
  const inSession = !!runnerTransaction.state(tab).get()
  try {
    const sets = await runnerTransaction.run({
      connectionResource,
      params: { ...params, signal },
      statement,
      tab,
    })
    const duration = performance.now() - startedAt
    return (sets.length > 0 ? sets : [null]).map((set) =>
      getResult(statement, { duration, set })
    )
  } catch (error) {
    let kind: RunnerError['kind'] = 'statement'
    if (error instanceof SessionRefusedError) {
      kind = 'connection'
    } else if (
      !inSession &&
      getQueryLanguage(params.dialect).unwrapTransaction(statement.text)
    ) {
      kind = 'block'
    }
    return [
      getResult(statement, {
        duration: performance.now() - startedAt,
        error: signal.aborted
          ? null
          : { kind, message: toError(error).message },
        stopped: signal.aborted,
      }),
    ]
  }
}

const captureQueryRun = ({
  dialect,
  failed,
  ran,
  results,
  statements,
  stopped,
}: {
  dialect: string | undefined
  failed: boolean
  ran: { duration: number }[]
  results: RunnerResult[]
  statements: number
  stopped: boolean
}) =>
  posthog.capture('query_run', {
    duration_ms: Math.round(
      ran.reduce((total, { duration }) => total + duration, 0)
    ),
    failed,
    rows: results.reduce(
      (total, { set }) => total + (set?.rows.length ?? 0),
      0
    ),
    statements,
    stopped,
    success: !failed && !stopped,
    type: dialect,
  })

export const runStatements = async ({
  connectionResource,
  statements,
  tabId,
}: {
  connectionResource: ConnectionResource
  statements: RunnerStatement[]
  tabId: string
}) => {
  const tab = { resourceId: connectionResource.id, tabId }
  const key = runKey(tab)
  const { queryKey } = runnerResultsOptions(tab)
  runs.get(key)?.abort()
  const controller = new AbortController()
  runs.set(key, controller)
  watchTab(tab)
  const { signal } = controller
  const current = () => runs.get(key) === controller
  const run: RunnerRun = { id: crypto.randomUUID(), results: [], running: true }
  const slots = statements.map((statement) => [
    getResult(statement, { pending: true }),
  ])
  const publish = () => {
    run.results = slots.flat()
    if (current()) {
      queryClient.setQueryData(queryKey, { ...run, results: [...run.results] })
    }
  }
  publish()

  const [first] = statements
  const paramsResult = await Result.tryPromise(async () => ({
    ...(await connectionResourceToQueryParams(connectionResource)),
    resultSets: { maxRows: MAX_RESULT_ROWS },
  }))
  if (paramsResult.isErr() && first) {
    slots.splice(0, slots.length, [
      getResult(first, {
        error: {
          kind: 'connection',
          message: toError(paramsResult.error.cause).message,
        },
      }),
    ])
  }
  const params = paramsResult.unwrapOr(null)
  const ran: (Omit<HistoryEntry, 'error' | 'id'> & {
    error: RunnerError | null
  })[] = []
  let failedAt: number | undefined
  if (params) {
    for (const [index, statement] of statements.entries()) {
      if (signal.aborted || failedAt !== undefined) {
        slots[index] = [
          getResult(
            statement,
            signal.aborted ? { stopped: true } : { skipped: true }
          ),
        ]
        continue
      }
      const ranAt = Date.now()
      // Sequential by design: statements run in order on one connection.
      // oxlint-disable-next-line no-await-in-loop
      const results = await runOne({
        connectionResource,
        params,
        signal,
        statement,
        tab,
      })
      slots[index] = results
      const [head] = results
      if (head?.error) {
        failedAt = index
      }
      if (head && !head.stopped) {
        ran.push({
          duration: head.duration,
          error: head.error,
          ranAt,
          sql: statement.source,
        })
      }
      publish()
    }
  }
  run.running = false
  publish()
  runHistory.add(
    connectionResource.id,
    ran.map((entry) => ({ ...entry, error: entry.error?.message ?? null }))
  )
  const dialect = params?.dialect
  captureQueryRun({
    dialect,
    failed: failedAt !== undefined,
    ran,
    results: run.results,
    statements: statements.length,
    stopped: signal.aborted,
  })
  // The pool sees none of an open transaction's writes and would wait on its locks; closing it refreshes instead.
  if (dialect && !runnerTransaction.state(tab).get()) {
    refreshAfterRun(
      connectionResource,
      dialect,
      statements.map((statement) => statement.text).join(';\n')
    )
  }

  if (!current()) {
    return
  }
  runs.delete(key)
  if (signal.aborted) {
    toast.info('Run stopped')
  } else if (failedAt !== undefined && failedAt < statements.length - 1) {
    toast.warning(
      `Statement ${failedAt + 1} of ${statements.length} failed, so the rest did not run`
    )
  }
}

export const stopRun = (tab: RunnerTab) => runs.get(runKey(tab))?.abort()
