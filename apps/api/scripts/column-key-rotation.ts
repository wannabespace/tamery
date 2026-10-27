import * as crypto from 'node:crypto'
import process from 'node:process'

import { db } from '@tamery/db'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { toError } from '@tamery/shared/utils'
import { getColumnTable, getTableName, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

type Identifier = ReturnType<typeof sql.identifier>

// Shared engine reused by rotate-encryption-secret.ts and rotate-user-key-secret.ts
// to rotate a secret that wraps encrypted columns at rest. The column types in
// `@tamery/db` bind the current secret at module load, so this reads and writes the
// raw ciphertext through `sql` rather than the ORM, decrypting with the old secret
// and re-encrypting with the new one. Because the key lives in env, not a store this
// process writes, the swap is a separate step: the whole DB flips atomically here,
// then the operator sets the env value and redeploys. Until that redeploy the running
// app cannot decrypt the columns, so run it in a maintenance window. Tagging the
// ciphertext with a key version would make the swap zero-downtime.

const SECRET_BYTES = 32

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
  newSecret,
  oldSecret,
}: {
  columns: EncryptedColumn[]
  execute: boolean
  newSecret: string
  oldSecret: string
}) => {
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
          newCipher: encrypt({
            secret: newSecret,
            text: decrypt({ encryptedText: row.cipher, secret: oldSecret }),
          }),
          rowId: row.id,
          target,
        })
      } catch {
        return {
          error: `${target.label} ${row.id} does not decrypt with the current secret`,
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
  oldSecret,
  secretName,
}: {
  columns: EncryptedColumn[]
  oldSecret: string
  secretName: string
}) => {
  const execute = process.argv.includes('--execute')
  const provided = process.argv
    .find((arg) => arg.startsWith('--new='))
    ?.slice('--new='.length)

  if (execute && !provided) {
    console.error(
      `Pass --new=<secret> with --execute: generate it, set ${secretName} to it in the secret store first, then rotate and redeploy. A dry run prints a candidate.`
    )
    process.exit(1)
  }

  const newSecret =
    provided ?? crypto.randomBytes(SECRET_BYTES).toString('base64url')

  const result = await reencrypt({ columns, execute, newSecret, oldSecret })

  if ('error' in result) {
    console.error(result.error)
    process.exit(1)
  }

  if (execute) {
    console.log(
      `Re-encrypted ${result.reEncrypted} value(s). Set ${secretName} in the secret store and redeploy the API; encrypted columns do not decrypt until then.`
    )
  } else {
    console.log(
      `Dry run: ${result.reEncrypted} value(s) verified decryptable with the current ${secretName}. To rotate: --execute --new=<secret>. Candidate:\n${newSecret}`
    )
  }

  process.exit(0)
}
