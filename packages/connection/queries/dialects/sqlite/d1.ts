import { noop } from '@tamery/shared/utils'
import { type } from 'arktype'

import { D1_HOST } from '../../../connection-parts'
import { readConnectionString } from '../../../parse-connection-string'
import type { RunStatements, SqliteTransport, SqliteValue } from './run'
import { toOutput } from './run'

const d1Answer = type({
  errors: type({ message: 'string' }).array(),
  'result?': type({
    meta: { changes: 'number' },
    results: { columns: 'string[]', rows: 'unknown[][]' },
  })
    .array()
    .or('null'),
  success: 'boolean',
})

/** D1 ends a SQL error with its result code, which a file's error never carries. */
const SQLITE_CODE_SUFFIX = /: SQLITE_\w+(?: \(extended: \w+\))?$/u

const BARE_OFFSET = / at offset (?<offset>\d+)$/u

interface D1Statement {
  params: unknown[]
  sql: string
}

/** JSON carries neither a 64-bit integer nor bytes. */
const toParam = (value: SqliteValue) => {
  if (typeof value === 'bigint') {
    return String(value)
  }
  return value instanceof Uint8Array ? [...value] : value
}

const toStatements = (texts: string[], values: SqliteValue[]) => {
  const params = values.map(toParam)
  return texts.map((sql): D1Statement => ({ params, sql }))
}

// `diagnose-sqlite.ts` matches this text, with or without the code.
const D1_TRANSPORT_ERROR = 'fetch failed'

const SOCKET_CODE = /^(?:E[A-Z]+|EAI_[A-Z]+|UND_ERR_[A-Z_]+)$/u

// Node's fetch names the failed lookup or socket in its cause, an `AggregateError` with an empty message for a dual-stack connect, Bun's (the CLI) on the error itself, and the desktop worker forwards nothing but the message.
const socketCode = (error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined
  return [error, ...(cause instanceof AggregateError ? cause.errors : [cause])]
    .map((reason: unknown) =>
      reason instanceof Error && 'code' in reason ? reason.code : undefined
    )
    .find((code: unknown) => typeof code === 'string' && SOCKET_CODE.test(code))
}

/** One statement goes alone; several go as a batch, which D1 runs in one transaction. */
const send = async (
  connectionString: string,
  statements: D1Statement[]
): ReturnType<RunStatements> => {
  const [only, ...rest] = statements
  if (!only) {
    return []
  }
  const { database, password, user } = readConnectionString(connectionString)
  const response = await fetch(
    `https://${D1_HOST}/client/v4/accounts/${encodeURIComponent(user)}/d1/database/${encodeURIComponent(database)}/raw`,
    {
      body: JSON.stringify(rest.length === 0 ? only : { batch: statements }),
      headers: {
        Authorization: `Bearer ${password}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  ).catch((error: unknown) => {
    throw new Error(
      [D1_TRANSPORT_ERROR, socketCode(error)].filter(Boolean).join(': '),
      { cause: error }
    )
  })
  const answer = d1Answer(await response.json().catch(() => null))
  if (answer instanceof type.errors || !answer.success || !answer.result) {
    const messages =
      answer instanceof type.errors
        ? []
        : answer.errors.map(({ message }) =>
            message
              .replace(SQLITE_CODE_SUFFIX, '')
              .replace(BARE_OFFSET, ' (at offset $<offset>)')
          )
    throw new Error(
      messages.join('\n') || `Cloudflare answered ${response.status}`
    )
  }
  return answer.result.map(({ meta, results }) => ({
    affectedRows: meta.changes,
    columns: results.columns,
    rows: results.rows.map((row) => row.map(toOutput)),
  }))
}

const readOnlyTransaction = (connectionString: string) => ({
  commit: noop,
  release: noop,
  rollback: noop,
  run: (texts: string[], values: SqliteValue[]) =>
    send(connectionString, toStatements(texts, values)),
})

const batchedTransaction = (connectionString: string) => {
  let pending: D1Statement[] = []
  return {
    commit: async () => {
      await send(connectionString, pending)
    },
    release: noop,
    rollback: () => {
      pending = []
    },
    run: (texts: string[], values: SqliteValue[]) => {
      pending = [...pending, ...toStatements(texts, values)]
      return Promise.resolve(
        texts.map(() => ({ affectedRows: null, columns: [], rows: [] }))
      )
    },
  }
}

export const d1Transport = {
  run: (connectionString, texts, values) =>
    send(connectionString, toStatements(texts, values)),

  transaction: (connectionString, readOnly) =>
    Promise.resolve(
      readOnly
        ? readOnlyTransaction(connectionString)
        : batchedTransaction(connectionString)
    ),
} satisfies SqliteTransport
