import '@tamery/shared/arktype-config'
import process from 'node:process'

import type { QueryExecutor } from '@tamery/connection/queries'
import { resetTransactions } from '@tamery/connection/queries/transactions'
import { sshForwarding } from '@tamery/connection/ssh/forwarding'
import type { ConfirmHostKey } from '@tamery/connection/ssh/host-key'
import { tunnelForwarding } from '@tamery/connection/ssh/tunnel'
import { isConnectionError } from '@tamery/shared/connections'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { logDriverError } from '@tamery/shared/sanitize-log'

import type { CopyDatabaseRequest } from './copy-database'
import { copyDatabase } from './copy-database'

export type QueryProcessRequest =
  | {
      type: 'call'
      id: number
      dialect: Dialect
      method: keyof QueryExecutor
      args: unknown
    }
  | { type: 'hostKey'; hostKeyId: number; trusted: boolean }
  | { type: 'resetTransactions' }
  | { type: 'copyDatabase'; id: number; request: CopyDatabaseRequest }
  | { type: 'cancelCopy'; copyId: string }

export type QueryProcessReply =
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; error: string }
  | {
      type: 'hostKey'
      hostKeyId: number
      prompt: Parameters<ConfirmHostKey>[0]
    }
  | { type: 'copyLog'; id: number; line: string }

const dialects: Record<Dialect, () => Promise<{ query: QueryExecutor }>> = {
  clickhouse: () => import('@tamery/connection/queries/dialects/clickhouse'),
  mongodb: () => import('@tamery/connection/queries/dialects/mongodb'),
  mssql: () => import('@tamery/connection/queries/dialects/mssql'),
  mysql: () => import('@tamery/connection/queries/dialects/mysql'),
  oracle: () => import('@tamery/connection/queries/dialects/oracle'),
  postgres: () => import('@tamery/connection/queries/dialects/pg'),
  sqlite: () => import('@tamery/connection/queries/dialects/sqlite'),
}

const reply = (message: QueryProcessReply) =>
  process.parentPort.postMessage(message)

const hostKeyAnswers = new Map<number, (trusted: boolean) => void>()
const copies = new Map<string, AbortController>()
let nextHostKeyId = 0

const perform = async (
  data: Extract<QueryProcessRequest, { type: 'call' | 'copyDatabase' }>
) => {
  if (data.type === 'call') {
    const { query } = await dialects[data.dialect]()
    const run = query[data.method] as (args: unknown) => Promise<unknown>
    return run(data.args)
  }
  const controller = new AbortController()
  copies.set(data.request.id, controller)
  await copyDatabase(
    data.request,
    (line) => reply({ id: data.id, line, type: 'copyLog' }),
    controller.signal
  ).finally(() => copies.delete(data.request.id))
  return null
}

sshForwarding.use((connectionString) =>
  tunnelForwarding(connectionString, (prompt) => {
    const hostKeyId = nextHostKeyId
    nextHostKeyId += 1
    const answer = Promise.withResolvers<boolean>()
    hostKeyAnswers.set(hostKeyId, answer.resolve)
    reply({ hostKeyId, prompt, type: 'hostKey' })
    return answer.promise
  })
)

process.parentPort.on(
  'message',
  async ({ data }: { data: QueryProcessRequest }) => {
    if (data.type === 'resetTransactions') {
      await resetTransactions()
      return
    }
    if (data.type === 'cancelCopy') {
      copies.get(data.copyId)?.abort()
      return
    }
    if (data.type === 'hostKey') {
      hostKeyAnswers.get(data.hostKeyId)?.(data.trusted)
      hostKeyAnswers.delete(data.hostKeyId)
      return
    }
    try {
      reply({ id: data.id, result: await perform(data), type: 'result' })
    } catch (error) {
      reply({
        error: error instanceof Error ? error.message : String(error),
        id: data.id,
        type: 'error',
      })
    }
  }
)

process.on('uncaughtException', (error) => {
  if (isConnectionError(error)) {
    logDriverError(error)
    return
  }
  throw error
})

process.on('unhandledRejection', (reason) => {
  if (isConnectionError(reason)) {
    logDriverError(reason)
    return
  }
  throw reason
})
