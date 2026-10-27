import process from 'node:process'

import { db } from '@tamery/db'
import { resolveKeyring } from '@tamery/db/utils'
import { Result } from 'better-result'
import { getColumnTable, getTableName, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

const BATCH_SIZE = 500

// A real schema column pair, so a wrong name is a compile error, not a silent runtime
// no-op: `cipher` is the encrypted column to rotate, `id` its table's primary key.
export interface EncryptedColumn {
  cipher: PgColumn
  id: PgColumn
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
    columns.map(({ cipher, id }) => {
      const tableName = getTableName(getColumnTable(cipher))
      const table = sql.identifier(tableName)
      const cipherColumn = sql.identifier(cipher.name)
      const idColumn = sql.identifier(id.name)

      const reencryptPage = async (afterId: string | null): Promise<number> => {
        const { rows } = await db.execute<{ cipher: string; id: string }>(
          sql`select ${idColumn} as id, ${cipherColumn} as cipher from ${table} where ${cipherColumn} is not null ${afterId === null ? sql`` : sql`and ${idColumn} > ${afterId}`} order by ${idColumn} limit ${BATCH_SIZE}`
        )
        const last = rows.at(-1)

        if (!last) {
          return 0
        }

        const reencrypted = rows.map((row) => {
          const plaintext = Result.try(() => keyring.decrypt(row.cipher))

          if (plaintext.isErr()) {
            throw new Error(
              `${tableName}.${cipher.name} ${row.id} does not decrypt with any key in the keyring`
            )
          }

          return { ...row, newCipher: keyring.encrypt(plaintext.value) }
        })

        if (!execute) {
          return rows.length + (await reencryptPage(last.id))
        }

        // Compare-and-swap on the old ciphertext: a row the app rewrote since the read is
        // already under the current key, and overwriting it would restore a stale value.
        const updates = await Promise.all(
          reencrypted.map((row) =>
            db.execute(
              sql`update ${table} set ${cipherColumn} = ${row.newCipher} where ${idColumn} = ${row.id} and ${cipherColumn} = ${row.cipher}`
            )
          )
        )
        const updated = updates.reduce(
          (sum, { rowCount }) => sum + (rowCount ?? 0),
          0
        )

        return updated + (await reencryptPage(last.id))
      }

      return reencryptPage(null)
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
