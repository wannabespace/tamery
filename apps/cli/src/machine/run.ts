import { forwarding } from '@tamery/connection/forwarding'
import { confineDuckdbFiles } from '@tamery/connection/queries/dialects/duckdb/instances'
import { confineSqliteFiles } from '@tamery/connection/queries/dialects/sqlite/client'
import { resetTransactions } from '@tamery/connection/queries/transactions'
import { tunnelForwarding } from '@tamery/connection/ssh/tunnel'
import { silently, toError } from '@tamery/shared/utils'
import { Result } from 'better-result'

import { api } from '../api'
import { approvals } from './approvals'
import { hostKeys } from './host-keys'
import { machineIdentity } from './identity'
import { createRouter } from './router'
import { serveMachine } from './server'

/** Often enough that another device reads `seenAt` as up while the machine runs. */
const REGISTER_INTERVAL_MS = 5 * 60 * 1000
const MAX_NAME_LENGTH = 100

/** A machine once its account is known: `tamery machine` and the desktop app's machine process both run this. */
export const runMachine = async ({
  name,
  port,
  publicUrl,
  userId,
}: {
  name: string
  port: number
  publicUrl: URL | null
  userId: string
}) => {
  forwarding.use((connectionString) =>
    tunnelForwarding(connectionString, hostKeys.confirm(connectionString))
  )
  confineDuckdbFiles()
  confineSqliteFiles()
  const id = machineIdentity.get()
  approvals.clear()
  const server = await serveMachine({
    port,
    publicUrl,
    router: createRouter({ id, name, userId }),
  })
  const url = `http://127.0.0.1:${server.port}`
  const register = () =>
    api.machines.register({
      id,
      name: name.slice(0, MAX_NAME_LENGTH),
      urls: publicUrl ? [publicUrl.origin, url] : [url],
    })
  const registered = await Result.tryPromise(register)
  const heartbeat = setInterval(() => silently(register), REGISTER_INTERVAL_MS)
  return {
    id,
    /** `null` once the account lists it; browsers can still connect with its URL otherwise. */
    registerError: registered.isErr()
      ? toError(registered.error.cause).message
      : null,
    stop: async () => {
      clearInterval(heartbeat)
      await server.stop()
      await resetTransactions()
    },
    url,
  }
}
