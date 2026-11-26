import { createStore } from 'seitu'

import type { OperationKind } from '~/core/agent/database'
import type { Connection } from '~/core/connection/sync'
import { notifications } from '~/lib/notifications'
import { posthog } from '~/lib/posthog'

interface Approval {
  connection: Connection
  decide: (approved: boolean) => void
  estimate: number | null
  id: string
  kind: OperationKind
  resourceName: string | null
  sql: string
}

const store = createStore<{ pending: Approval[] }>({ pending: [] })

const request = async ({
  connection,
  estimate,
  kind,
  resourceName,
  signal,
  sql,
}: {
  connection: Connection
  estimate: (signal: AbortSignal) => Promise<number | null>
  kind: OperationKind
  resourceName: string | null
  signal: AbortSignal
  sql: string
}) => {
  signal.throwIfAborted()
  const id = crypto.randomUUID()
  const decided = new AbortController()
  const estimated = estimate(AbortSignal.any([signal, decided.signal])).then(
    (rows) => {
      store.set(({ pending }) => ({
        pending: pending.map((item) =>
          item.id === id ? { ...item, estimate: rows } : item
        ),
      }))
      return rows
    }
  )

  const decision = Promise.withResolvers<boolean>()
  signal.addEventListener(
    'abort',
    () => decision.reject(new Error('The agent stopped waiting.')),
    { once: true }
  )
  store.set(({ pending }) => ({
    pending: [
      ...pending,
      {
        connection,
        decide: decision.resolve,
        estimate: null,
        id,
        kind,
        resourceName,
        sql,
      },
    ],
  }))
  notifications.notify({
    body: 'Review the statement in Tamery to run or decline it.',
    title: `An agent wants to change ${connection.name}`,
  })

  try {
    const approved = await decision.promise
    posthog.capture('mcp_write_reviewed', {
      approved,
      connection_type: connection.type,
      kind,
    })
    if (!approved) {
      throw new Error('The user declined to run this statement.')
    }
  } finally {
    store.set(({ pending }) => ({
      pending: pending.filter((item) => item.id !== id),
    }))
    decided.abort()
    // The pool holds one connection: the approved statement must not start before the estimate has rolled back.
    await estimated
  }
}

export const approval = { request, store }
