import process from 'node:process'

import { type } from 'arktype'
import { lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

import { deletedRecords } from '../schema/deleted-records'

const { DATABASE_URL } = type({ DATABASE_URL: 'string' }).assert(process.env)

const db = drizzle(DATABASE_URL)

const purged = await db
  .delete(deletedRecords)
  .where(lt(deletedRecords.deletedAt, sql`now() - interval '90 days'`))
  .returning({ recordId: deletedRecords.recordId })

console.log(`Purged ${purged.length} deleted records older than 90 days.`)
await db.$client.end()
