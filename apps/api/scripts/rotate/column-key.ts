import process from 'node:process'

import { db } from '@tamery/db'
import { resolveKeyring } from '@tamery/db/utils'
import { toError } from '@tamery/shared/utils'
import { getColumnTable, getTableName, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

type Identifier = ReturnType<typeof sql.identifier>

// Shared engine reused by encryption-secret.ts and user-key-secret.ts to re-encrypt
// every column a wrapping secret protects under that secret's current key. It reads and
// writes the raw ciphertext through `sql` rather than the ORM so it can run in one
// transaction, and decrypts through the keyring (every key tried) so a row still under a
// retiring key re-encrypts under the current one. This is the background step of a
// zero-downtime rotation: prepend the new key (`new,old`) and redeploy first, run this,
// then drop the old key — the keyring keeps the app decrypting throughout.

// A real schema column pair, so a wrong name is a compile error, not a silent runtime
// no-op: `cipher` is the encrypted column to rotate, `id` its table's primary key.
export interface EncryptedColumn {
  cipher: PgColumn
  id: PgColumn
}

interface ColumnTarget {
  cipher: Identifier
  id: Identifier
  label: string
  table: Identifier
}

const toTarget = ({ cipher, id }: EncryptedColumn): ColumnTarget => {
  const table = getTableName(getColumnTable(cipher))

  return {
    cipher: sql.identifier(cipher.name),
    id: sql.identifier(id.name),
    label: `${table}.${cipher.name}`,
    table: sql.identifier(table),
  }
}

const reencrypt = async ({
  columns,
  execute,
  secrets,
}: {
  columns: EncryptedColumn[]
  execute: boolean
  secrets: string
}) => {
  const keyring = resolveKeyring(secrets)
  const migrations: {
    newCipher: string
    rowId: string
    target: ColumnTarget
  }[] = []

  for (const column of columns) {
    const target = toTarget(column)

    // oxlint-disable-next-line no-await-in-loop -- read every column before any write, so a decrypt failure aborts untouched
    const { rows } = await db.execute<{ cipher: string; id: string }>(
      sql`select ${target.id} as id, ${target.cipher} as cipher from ${target.table} where ${target.cipher} is not null`
    )

    for (const row of rows) {
      try {
        migrations.push({
          newCipher: keyring.encrypt(keyring.decrypt(row.cipher)),
          rowId: row.id,
          target,
        })
      } catch {
        return {
          error: `${target.label} ${row.id} does not decrypt with any key in the keyring`,
        }
      }
    }
  }

  if (!execute) {
    return { reEncrypted: migrations.length }
  }

  try {
    await db.transaction(async (tx) => {
      for (const { newCipher, rowId, target } of migrations) {
        // oxlint-disable-next-line no-await-in-loop -- one statement per row, each a distinct ciphertext on one tx connection
        await tx.execute(
          sql`update ${target.table} set ${target.cipher} = ${newCipher} where ${target.id} = ${rowId}`
        )
      }
    })
  } catch (error) {
    return {
      error: `rotation aborted, no changes applied: ${toError(error).message}`,
    }
  }

  return { reEncrypted: migrations.length }
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
  const result = await reencrypt({ columns, execute, secrets })

  if ('error' in result) {
    console.error(result.error)
    process.exit(1)
  }

  if (execute) {
    console.log(
      `Re-encrypted ${result.reEncrypted} value(s) under the current ${secretName}. Once this succeeds for every instance, drop the retired key from ${secretName} and redeploy.`
    )
  } else {
    console.log(
      `Dry run: ${result.reEncrypted} value(s) verified decryptable with the current ${secretName} keyring. Re-run with --execute to re-encrypt them under its current key.`
    )
  }

  process.exit(0)
}
