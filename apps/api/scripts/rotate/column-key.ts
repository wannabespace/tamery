import process from 'node:process'

import { db } from '@tamery/db'
import { copies, deletedRecords } from '@tamery/db/schema'
import { resolveKeyring } from '@tamery/db/utils'
import { Result } from 'better-result'
import { getColumnTable, getTableName, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

const BATCH_SIZE = 500

// A real schema column pair, so a wrong name is a compile error, not a silent runtime
// no-op: `cipher` is the encrypted column to rotate, `id` its table's primary key.
export interface EncryptedColumn {
  cipher: PgColumn
  id: PgColumn
}

interface CipherSource {
  label: string
  select: (afterId: string | null) => SQL
  update: (row: { cipher: string; id: string; newCipher: string }) => SQL
}

export const runColumnKeyRotation = async ({
  columns,
  secretName,
  secrets,
}: {
  columns: EncryptedColumn[]
  secretName: string
  secrets: string
}) => {
  const execute = process.argv.includes('--execute')
  const keyring = resolveKeyring(secrets)
  const counts = await Promise.all(
    columns.flatMap(({ cipher, id }) => {
      const sourceTable = getColumnTable(cipher)
      const tableName = getTableName(sourceTable)
      const table = sql.identifier(tableName)
      const cipherColumn = sql.identifier(cipher.name)
      const idColumn = sql.identifier(id.name)
      const copyCipher = copies.column(cipher)

      const reencryptPage = async (
        source: CipherSource,
        afterId: string | null
      ): Promise<number> => {
        const { rows } = await db.execute<{ cipher: string; id: string }>(
          source.select(afterId)
        )
        const last = rows.at(-1)

        if (!last) {
          return 0
        }

        const reencrypted = rows.map((row) => {
          const plaintext = Result.try(() => keyring.decrypt(row.cipher))

          if (plaintext.isErr()) {
            throw new Error(
              `${source.label} ${row.id} does not decrypt with any key in the keyring`
            )
          }

          return { ...row, newCipher: keyring.encrypt(plaintext.value) }
        })

        if (!execute) {
          return rows.length + (await reencryptPage(source, last.id))
        }

        // Compare-and-swap on the old ciphertext: a row the app rewrote since the read is
        // already under the current key, and overwriting it would restore a stale value.
        const updates = await Promise.all(
          reencrypted.map((row) => db.execute(source.update(row)))
        )
        const updated = updates.reduce(
          (sum, { rowCount }) => sum + (rowCount ?? 0),
          0
        )

        return updated + (await reencryptPage(source, last.id))
      }

      const sources: CipherSource[] = [
        {
          label: `${tableName}.${cipher.name}`,
          select: (afterId) =>
            sql`select ${idColumn} as id, ${cipherColumn} as cipher from ${table} where ${cipherColumn} is not null ${afterId === null ? sql`` : sql`and ${idColumn} > ${afterId}`} order by ${idColumn} limit ${BATCH_SIZE}`,
          update: (row) =>
            sql`update ${table} set ${cipherColumn} = ${row.newCipher} where ${idColumn} = ${row.id} and ${cipherColumn} = ${row.cipher}`,
        },
        {
          label: `deleted ${tableName}.${cipher.name}`,
          select: (afterId) =>
            sql`select ${deletedRecords.recordId} as id, ${copyCipher} as cipher from ${deletedRecords} where ${copies.of(sourceTable)} and ${copyCipher} is not null ${afterId === null ? sql`` : sql`and ${deletedRecords.recordId} > ${afterId}`} order by ${deletedRecords.recordId} limit ${BATCH_SIZE}`,
          update: (row) =>
            sql`update ${deletedRecords} set ${sql.identifier(deletedRecords.data.name)} = ${copies.replace(cipher, row.newCipher)} where ${copies.of(sourceTable)} and ${deletedRecords.recordId} = ${row.id} and ${copyCipher} = ${row.cipher}`,
        },
      ]

      return sources.map((source) => reencryptPage(source, null))
    })
  )
  const total = counts.reduce((sum, count) => sum + count, 0)

  console.log(
    execute
      ? `Re-encrypted ${total} value(s) under the current ${secretName} key. Safe to re-run if interrupted; once it completes, drop the retired key from ${secretName} and redeploy.`
      : `Dry run: ${total} value(s) verified decryptable with the ${secretName} keyring. Re-run with --execute to re-encrypt them under its current key.`
  )

  process.exit(0)
}
