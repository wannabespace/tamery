import process from 'node:process'

import { chatAttachmentsPrefix } from '@tamery/shared/attachments'
import { type } from 'arktype'
import { S3Client } from 'bun'
import { and, eq, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

// Only this schema file: the chats schema reaches `../env`, which asserts secrets this job does not have.
import { deletedRecords } from '../schema/deleted-records'

const RETENTION_DAYS = 90

const env = type({
  DATABASE_URL: 'string',
  S3_ACCESS_KEY_ID: 'string',
  S3_BUCKET: 'string',
  S3_ENDPOINT: 'string',
  S3_SECRET_ACCESS_KEY: 'string',
}).assert(process.env)

const db = drizzle(env.DATABASE_URL)
const bucket = new S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  bucket: env.S3_BUCKET,
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
})

// One cutoff for both steps: a copy that turns old between them would lose its row and keep its files.
const expired = lt(
  deletedRecords.deletedAt,
  new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
)

const deleteFiles = async (prefix: string): Promise<void> => {
  const { contents = [] } = await bucket.list({ prefix })
  if (contents.length === 0) {
    return
  }
  await Promise.all(contents.map(({ key }) => bucket.delete(key)))
  await deleteFiles(prefix)
}

// Files go before the copies: a failed delete leaves the chat's copy for the next run to try again, never files no copy points to.
const chats = await db
  .select({
    createdAt: sql<string>`${deletedRecords.data} ->> 'created_at'`,
    id: deletedRecords.recordId,
  })
  .from(deletedRecords)
  .where(and(eq(deletedRecords.tableName, 'chats'), expired))
await Promise.all(
  chats.map(({ createdAt, id }) =>
    deleteFiles(chatAttachmentsPrefix({ createdAt: new Date(createdAt), id }))
  )
)

const { rowCount } = await db.delete(deletedRecords).where(expired)

console.log(
  `Purged ${rowCount} deleted records older than ${RETENTION_DAYS} days, with the files of ${chats.length} chats.`
)
await db.$client.end()
