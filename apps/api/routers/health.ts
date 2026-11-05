import { db } from '@tamery/db'
import { logDriverError } from '@tamery/shared/sanitize-log'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'

export const healthRouter = new Hono().get('/', async (c) => {
  const database = await Result.tryPromise(() => db.execute(sql`select 1`))

  if (database.isErr()) {
    logDriverError(toError(database.error.cause))
    // Public route: the driver's message can name the database host, so it stays in the logs.
    return c.json({ status: 'error' }, 500)
  }

  return c.json({ status: 'ok' })
})
