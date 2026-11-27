import { db } from '@tamery/db'
import { env } from '@tamery/db/env'
import { chats, copies, deletedRecords } from '@tamery/db/schema'
import { resolveKeyring } from '@tamery/db/utils'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

const BATCH_SIZE = 500
const keyring = resolveKeyring(env.ENCRYPTION_SECRET)

const encryptBatch = async (source: {
  select: () => SQL
  update: (row: { encrypted: string; id: string; title: string }) => SQL
}): Promise<void> => {
  const { rows } = await db.execute<{ id: string; title: string }>(
    source.select()
  )
  if (rows.length === 0) {
    return
  }
  await Promise.all(
    rows.map((row) =>
      db.execute(
        source.update({ ...row, encrypted: keyring.encrypt(row.title) })
      )
    )
  )
  await encryptBatch(source)
}

/** Moves plaintext chat titles, deleted copies' too, into `encrypted_title` before the API serves, since the ORM reads only that column. Once a deploy has run it, the migration that drops the plaintext `title` column removes this with it. A title another device kept writing in plaintext during the rollout is picked up on the next batch, since the update matches the value it read. */
export const encryptChatTitles = async () => {
  await encryptBatch({
    select: () =>
      sql`select id, title from chats where title is not null limit ${BATCH_SIZE}`,
    update: (row) =>
      sql`update chats set encrypted_title = coalesce(encrypted_title, ${row.encrypted}), title = null where id = ${row.id} and title = ${row.title}`,
  })
  await encryptBatch({
    select: () =>
      sql`select ${deletedRecords.recordId} as id, ${deletedRecords.data} ->> 'title' as title from ${deletedRecords} where ${copies.of(chats)} and ${deletedRecords.data} ->> 'title' is not null limit ${BATCH_SIZE}`,
    update: (row) =>
      sql`update ${deletedRecords} set data = (data - 'title') || jsonb_build_object('encrypted_title', coalesce(data ->> 'encrypted_title', ${row.encrypted}::text)) where ${copies.of(chats)} and ${deletedRecords.recordId} = ${row.id} and data ->> 'title' = ${row.title}`,
  })
}
