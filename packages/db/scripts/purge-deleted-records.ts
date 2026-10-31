import process from 'node:process'

import { type } from 'arktype'
import { lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

import { deletedRecords } from '../schema/deleted-records'

const RETENTION = '90 days'

const { DATABASE_URL } = type({ DATABASE_URL: 'string' }).assert(process.env)

const db = drizzle(DATABASE_URL)

const { rowCount } = await db
  .delete(deletedRecords)
  .where(lt(deletedRecords.deletedAt, sql`now() - ${RETENTION}::interval`))

console.log(`Purged ${rowCount} deleted records older than ${RETENTION}.`)
await db.$client.end()
